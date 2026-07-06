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
        let languages = {};
        
        if (Array.isArray(repos)) {
            repos.forEach(repo => {
                totalStars += repo.stargazers_count || 0;
                if (repo.language) {
                    languages[repo.language] = (languages[repo.language] || 0) + 1;
                }
            });
        }

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
            } else if (file.includes('telemetry')) {
                // <text fill="var(--bone)" class="mono" x="720" y="118" font-size="44">31</text><text fill="var(--muted)" class="mono" x="790" y="112" font-size="10" letter-spacing="2.5">REPOSITORIES</text>
                content = content.replace(/(font-size="44">)\d+(<\/text><text[^>]+>REPOSITORIES<\/text>)/, `$1${totalRepos}$2`);
            }

            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        }
        
    } catch (err) {
        console.error("Error updating stats:", err);
    }
}

updateStats();
