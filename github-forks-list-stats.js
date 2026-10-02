(async (HIDE_UNMODIFIED=false, ALL_BRANCHES=true, MAX_FORKS=Infinity) => {
    /*
      Source: github.com/cryhot/github-fork-bookmarklet
      Purpose: On the forks page of a GitHub repo (list view), show for each fork how far it is from its parent (ahead, behind, new branches), and hide or gray out the unmodified forks.
      Options are documented in the README.
    */

    /* Ensure the script is run on a valid GitHub repository page, and go to the forks page if needed */
    const ensureForksPage = async () => {
        const match = window.location.href.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/forks\/?)?/);
        if (!match) {
            alert('Run this from a GitHub repository page.');
            throw new Error('Not on a valid GitHub repository page.');
        }
        if (!match[3]) {
            const forksUrl = `https://github.com/${match[1]}/${match[2]}/forks`;
            if (!window.Turbo) {
                window.location.href = forksUrl;
                throw new Error('Redirecting to the forks page.');
            }
            /* Keep running once the forks page is loaded */
            const loaded = new Promise((resolve) => document.addEventListener('turbo:load', resolve, { once: true }));
            window.Turbo.visit(forksUrl);
            await loaded;
        }
        return { user: match[1], repo: match[2] };
    };

    /* Fetch the default branch of a repository */
    const getDefaultBranch = async (user, repo) => {
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}`);
        if (!response.ok) throw new Error('Failed to retrieve repository information.');
        return (await response.json()).default_branch;
    };

    /* Fetch branch information of a repository (null on failure) */
    const getBranchInfo = async (user, repo, branch) => {
        try {
            const response = await fetch(`https://github.com/${user}/${repo}/branch-infobar/${branch}`, { headers: { accept: 'application/json' } });
            return response.ok ? (await response.json()).refComparison : null;
        } catch (error) {
            console.error(`Error fetching branch info for ${user}/${repo}:`, error);
            return null;
        }
    };

    /* Fetch the branch names of a repository (null on failure) */
    const getBranches = async (user, repo) => {
        try {
            const response = await fetch(`https://github.com/${user}/${repo}/refs?type=branch`, { headers: { accept: 'application/json' } });
            return response.ok ? (await response.json()).refs : null;
        } catch (error) {
            console.error(`Error fetching branches for ${user}/${repo}:`, error);
            return null;
        }
    };

    /* Fetch the branch names of the parent repos (cached by lowercase name) */
    const parentBranchesCache = new Map();
    const getParentBranches = async (parent) => {
        const key = parent.toLowerCase();
        if (!parentBranchesCache.has(key)) {
            const [parentUser, parentRepo] = parent.split('/');
            parentBranchesCache.set(key, new Set(await getBranches(parentUser, parentRepo) || []));
        }
        return parentBranchesCache.get(key);
    };

    /* Fetch the stats of a fork: the largest ahead and behind among its branches, and its branches that do not exist in its parent repo */
    const getForkStats = async (user, repo, defaultBranch) => {
        /* Attempt to fetch branch information, with fallback to the fork's default branch */
        let branchName = defaultBranch;
        let branchInfo = await getBranchInfo(user, repo, branchName);
        if (!branchInfo) {
            branchName = await getDefaultBranch(user, repo);
            branchInfo = await getBranchInfo(user, repo, branchName);
        }
        if (!branchInfo) return null;

        /* The default branch is already fetched, and its parent repo is given by the comparison base (like ahead and behind) */
        const infos = [{ name: branchName, ...branchInfo }];
        const newBranches = [];
        if (ALL_BRANCHES) {
            const forkBranches = await getBranches(user, repo) || [];
            const parentBranches = await getParentBranches(branchInfo.baseBranch.split(':')[0]);
            for (const name of forkBranches) {
                if (!parentBranches.has(name)) newBranches.push(name);
                if (name === branchName) continue;
                const info = await getBranchInfo(user, repo, name.split('/').map(encodeURIComponent).join('/'));
                if (info) infos.push({ name, ...info });
            }
        }
        const largest = (key) => infos.reduce((best, info) => info[key] > best[key] ? info : best, infos[0]);
        return { newBranches, maxAhead: largest('ahead'), maxBehind: largest('behind') };
    };

    /* A fork is modified if it is ahead or has new branches */
    const isModified = ({ newBranches, maxAhead }) => maxAhead.ahead > 0 || newBranches.length > 0;

    /* Escape a text to put it in an HTML attribute */
    const escapeHtml = (text) => text.replace(/["<&]/g, (c) => `&#${c.charCodeAt(0)};`);

    /* Format the stats of a fork; a zero is faded with opacity so it works in light and dark modes, and so is a comma next to a zero */
    const formatForkStats = ({ newBranches, maxAhead, maxBehind }) => [
        ['Ahead', maxAhead.ahead, '#0c0', maxAhead.ahead > 0 ? escapeHtml(maxAhead.name) : ''],
        ['Behind', maxBehind.behind, 'red', maxBehind.behind > 0 ? escapeHtml(maxBehind.name) : ''],
        ...(ALL_BRANCHES ? [['New branches', newBranches.length, '#08f', escapeHtml(newBranches.join(', '))]] : [])
    ].map(([label, value, color, title], i, stats) => {
        const comma = i > 0 ? `<span style="opacity: ${value === 0 || stats[i - 1][1] === 0 ? 0.35 : 1}">, </span>` : '';
        return `${comma}<span style="opacity: ${value === 0 ? 0.35 : 1}" title="${title}">${label}: <font color="${color}">${value}</font></span>`;
    }).join('');

    try {
        /* Ensure on the forks page and get main repository details */
        const { user: mainUser, repo: mainRepo } = await ensureForksPage();

        /* Reset the results of a previous run */
        document.querySelectorAll('.fork-stats').forEach((el) => el.remove());
        const forks = [...document.querySelectorAll('ul[data-view-component="true"] > li.Box-row')];
        forks.forEach((el) => { el.style.display = ''; el.style.opacity = ''; el.style.boxShadow = ''; });

        const defaultBranch = await getDefaultBranch(mainUser, mainRepo);

        /* Fetch the stats of each fork */
        for (const fork of forks.slice(0, MAX_FORKS)) {
            const repoLink = fork.querySelector('a[href*="/"]:nth-of-type(2)');

            /* Show a halo on the fork being fetched */
            fork.style.boxShadow = '0 0 8px 2px gold';
            try {
                const [_, user, repo] = repoLink?.href.match(/github\.com\/([^/]+)\/([^/]+)/) || [];
                if (!user || !repo) continue;
                const stat = await getForkStats(user, repo, defaultBranch);
                if (!stat) continue;

                /* Hide or show branch details for forks based on modifications */
                const isUnmodified = !isModified(stat);
                if (isUnmodified && HIDE_UNMODIFIED) {
                    fork.style.display = 'none';
                } else {
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'fork-stats';
                    infoDiv.innerHTML = formatForkStats(stat);
                    infoDiv.style.marginTop = '10px';
                    infoDiv.style.fontSize = 'small';
                    fork.appendChild(infoDiv);
                    if (isUnmodified) fork.style.opacity = 0.5;
                }
            } catch (error) {
                console.error(`Error processing link: ${repoLink?.href}`, error);
            } finally {
                fork.style.boxShadow = '';
            }
        }
    } catch (error) {
        console.error('Error in bookmarklet execution:', error);
    }
})();
