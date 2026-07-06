const fs = require('fs');
const https = require('https');
const path = require('path');

const username = 'bipladipsaha';
const token = process.env.GITHUB_TOKEN; // Injected by GitHub Actions

const options = {
    headers: {
        'User-Agent': 'Node.js',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
};

function fetchGraphQL(query) {
    return new Promise((resolve, reject) => {
        if (!token) {
            return resolve({ data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 228 } } } } }); // Fallback local
        }
        const req = https.request('https://api.github.com/graphql', {
            method: 'POST',
            headers: options.headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ query }));
        req.end();
    });
}

function fetchREST(endpoint) {
    return new Promise((resolve, reject) => {
        https.get(`https://api.github.com${endpoint}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function updateStats() {
    try {
        console.log("Fetching user data...");
        const user = await fetchREST(`/users/${username}`);
        const repos = await fetchREST(`/users/${username}/repos?per_page=100`);
        
        const query = `
            query {
                user(login: "${username}") {
                    contributionsCollection {
                        contributionCalendar {
                            totalContributions
                        }
                    }
                }
            }
        `;
        const gqlData = await fetchGraphQL(query);

        const totalRepos = user.public_repos || 31;
        const totalCommits = gqlData?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions || 228;
        
        let totalStars = 0;
        let langCounts = {};
        let totalLangCount = 0;
        
        if (Array.isArray(repos)) {
            repos.forEach(repo => {
                totalStars += repo.stargazers_count || 0;
                if (repo.language) {
                    let lang = repo.language.toUpperCase();
                    if (lang === 'JUPYTER NOTEBOOK') lang = 'JUPYTER';
                    langCounts[lang] = (langCounts[lang] || 0) + 1;
                    totalLangCount++;
                }
            });
        }
        
        const langEntries = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

        console.log(`Stats fetched: ${totalRepos} repos, ${totalStars} stars, ${totalCommits} commits.`);

        const filesToUpdate = [
            'assets/github-stats.svg',
            'assets/dark/github-stats.svg',
            'assets/telemetry.svg',
            'assets/dark/telemetry.svg'
        ];

        for (const file of filesToUpdate) {
            const filePath = path.join(__dirname, '..', '..', file);
            if (!fs.existsSync(filePath)) continue;

            let content = fs.readFileSync(filePath, 'utf8');

            if (file.includes('github-stats')) {
                content = content.replace(/(TOTAL STARS<\/text><text[^>]+>)\d+(<\/text>)/, `$1${totalStars}$2`);
                content = content.replace(/(YEARLY COMMITS<\/text><text[^>]+>)\d+(<\/text>)/, `$1${totalCommits}$2`);
                
                const top5 = langEntries.slice(0, 5);
                let langSVG = '';
                const yStarts = [105, 141, 177, 213, 249];
                const gClasses = ['', ' g2', ' g3', ' g4', ' g5'];
                
                top5.forEach(([lang, count], i) => {
                    const width = Math.max(10, Math.round((count / totalLangCount) * 270));
                    langSVG += `    <text x="548" y="${yStarts[i]}" font-size="10">${lang}</text><rect class="bar" x="660" y="${yStarts[i]-11}" width="270" height="12"/><rect class="fill grow${gClasses[i]}" x="660" y="${yStarts[i]-11}" width="${width}" height="12"/>\n`;
                });
                
                content = content.replace(/(<line class="rule" x1="548" y1="72" x2="948" y2="72"\/>\s*)[\s\S]*?(<\/g>)/, `$1${langSVG}  $2`);

            } else if (file.includes('telemetry')) {
                content = content.replace(/(font-size="44">)\d+(<\/text><text[^>]+>REPOSITORIES<\/text>)/, `$1${totalRepos}$2`);
                
                const top5 = langEntries.slice(0, 5);
                let otherCount = langEntries.slice(5).reduce((sum, [, count]) => sum + count, 0);
                const teleLangs = [...top5, ['OTHER', otherCount]];
                
                const widths = [230, 205, 145, 110, 85, 68];
                const xText2 = [288, 263, 203, 168, 143, 126];
                let teleSVG = '';
                const yStarts = [108, 146, 184, 222, 260, 298];
                
                teleLangs.forEach(([lang, count], i) => {
                    const perc = Math.round((count / totalLangCount) * 100);
                    const color = i === 0 ? 'var(--accent)' : 'var(--bone)';
                    teleSVG += `    <text fill="var(--bone)" x="48" y="${yStarts[i]}">${lang}</text><rect class="bar g${i+1}" x="48" y="${yStarts[i]+8}" width="${widths[i]}" height="6" fill="${color}"/><text fill="var(--muted)" x="${xText2[i]}" y="${yStarts[i]+15}" font-size="10">${perc}%</text>\n`;
                });
                
                content = content.replace(/(<g class="mono" font-size="11">\s*)[\s\S]*?(<\/g>)/, `$1${teleSVG}  $2`);
            }

            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        }
        
    } catch (err) {
        console.error("Error updating stats:", err);
    }
}

updateStats();
