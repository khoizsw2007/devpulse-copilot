(() => {
  "use strict";

  const GITHUB_API_BASE = "https://api.github.com";

  // DOM Elements - Analyzer
  const analyzerForm = document.getElementById("analyzerForm");
  const repoInput = document.getElementById("repoInput");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const loadSampleOfflineBtn = document.getElementById("loadSampleOfflineBtn");
  const analyzerStatus = document.getElementById("analyzerStatus");
  const analyzerResults = document.getElementById("analyzerResults");
  const rateLimitBadge = document.getElementById("rateLimitBadge");

  const repoTitleLink = document.getElementById("repoTitleLink");
  const repoDescription = document.getElementById("repoDescription");
  const repoLanguageBadge = document.getElementById("repoLanguageBadge");
  const metricStars = document.getElementById("metricStars");
  const metricForks = document.getElementById("metricForks");
  const metricIssues = document.getElementById("metricIssues");
  const metricLicense = document.getElementById("metricLicense");
  const metricUpdated = document.getElementById("metricUpdated");
  const metricBranch = document.getElementById("metricBranch");

  const healthScoreNum = document.getElementById("healthScoreNum");
  const healthVerdictBadge = document.getElementById("healthVerdictBadge");
  const healthProgressBar = document.getElementById("healthProgressBar");
  const healthBreakdown = document.getElementById("healthBreakdown");

  const focusedIssuePanel = document.getElementById("focusedIssuePanel");
  const issuesList = document.getElementById("issuesList");
  const checklistTargetMeta = document.getElementById("checklistTargetMeta");
  const implementationChecklist = document.getElementById("implementationChecklist");
  const copyChecklistBtn = document.getElementById("copyChecklistBtn");

  // DOM Elements - Grant Calculator
  const projectStageEl = document.getElementById("projectStage");
  const ossStatusEl = document.getElementById("ossStatus");
  const ecosystemFocusEl = document.getElementById("ecosystemFocus");
  const demoStatusEl = document.getElementById("demoStatus");
  const weeklyHoursEl = document.getElementById("weeklyHours");
  const weeklyHoursValEl = document.getElementById("weeklyHoursVal");
  const fundingTargetEl = document.getElementById("fundingTarget");
  const fundingTargetValEl = document.getElementById("fundingTargetVal");
  const hasVideoPitchEl = document.getElementById("hasVideoPitch");
  const hasRoadmapEl = document.getElementById("hasRoadmap");

  const grantScoreNum = document.getElementById("grantScoreNum");
  const grantTierBadge = document.getElementById("grantTierBadge");
  const estimatedFundingRange = document.getElementById("estimatedFundingRange");
  const grantProgressBar = document.getElementById("grantProgressBar");
  const readinessActionTips = document.getElementById("readinessActionTips");
  const matchedGrantsList = document.getElementById("matchedGrantsList");

  // App State
  let currentRepo = null;
  let currentIssues = [];
  let activeFilter = "all";
  let selectedIssue = null;
  let lastChecklistMarkdown = "";

  const OFFLINE_SNAPSHOT = {
    repo: {
      full_name: "solana-labs/solana-web3.js",
      html_url: "https://github.com/solana-labs/solana-web3.js",
      description: "Solana JavaScript SDK for building client and server-side on-chain applications.",
      language: "TypeScript",
      stargazers_count: 3450,
      forks_count: 1120,
      open_issues_count: 68,
      license: { spdx_id: "Apache-2.0" },
      pushed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      default_branch: "main",
    },
    issues: [
      {
        number: 2418,
        title: "Add typed helper for versioned transaction fee estimation",
        html_url: "https://github.com/solana-labs/solana-web3.js/issues/2418",
        comments: 4,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        labels: [{ name: "good first issue" }, { name: "enhancement" }],
        body: "Expose a clean TypeScript helper to estimate priority fees for VersionedTransaction payloads.",
      },
      {
        number: 2409,
        title: "[Bounty] Improve WebSocket reconnection backoff & jitter handling",
        html_url: "https://github.com/solana-labs/solana-web3.js/issues/2409",
        comments: 9,
        created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
        labels: [{ name: "bounty" }, { name: "help wanted" }, { name: "bug" }],
        body: "Under flaky RPC connections, exponential backoff should cap cleanly with deterministic jitter.",
      },
      {
        number: 2394,
        title: "Document browser polyfill troubleshooting for Vite & Next.js App Router",
        html_url: "https://github.com/solana-labs/solana-web3.js/issues/2394",
        comments: 2,
        created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
        labels: [{ name: "documentation" }, { name: "good first issue" }],
        body: "Add minimal copy-paste Vite and Next.js config snippets to README.",
      },
    ],
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCompactNumber(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  }

  function formatRelativeDate(isoDate) {
    if (!isoDate) return "Unknown";
    const diffDays = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 30) return `${diffDays} days ago`;
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  function parseGitHubTarget(rawInput) {
    const trimmed = rawInput.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
    if (!trimmed) return null;

    // Match full URL: https://github.com/owner/repo(/issues/123)
    const urlMatch = trimmed.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/issues\/(\d+))?/i
    );
    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2],
        issueNumber: urlMatch[3] ? Number(urlMatch[3]) : null,
      };
    }

    // Match shorthand: owner/repo or owner/repo#123
    const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#(\d+))?$/);
    if (shortMatch) {
      return {
        owner: shortMatch[1],
        repo: shortMatch[2],
        issueNumber: shortMatch[3] ? Number(shortMatch[3]) : null,
      };
    }

    return null;
  }

  function setStatus(message, type = "info") {
    if (!message) {
      analyzerStatus.classList.add("hidden");
      analyzerStatus.textContent = "";
      return;
    }
    analyzerStatus.className = `status-banner ${type}`;
    analyzerStatus.textContent = message;
  }

  function updateRateLimitBadge(headers) {
    if (!headers) return;
    const remaining = headers.get("x-ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit");
    if (remaining !== null && limit !== null) {
      rateLimitBadge.innerHTML = `<span class="dot dot-live"></span><span>GitHub API: ${escapeHtml(remaining)}/${escapeHtml(limit)} left</span>`;
    }
  }

  function computeRepoHealth(repo) {
    const stars = repo.stargazers_count || 0;
    const forks = repo.forks_count || 0;
    const openIssues = repo.open_issues_count || 0;
    const daysSincePush = repo.pushed_at
      ? Math.max(0, (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000)
      : 365;

    // 1. Popularity & Trust (max 30)
    let popularityScore = 8;
    if (stars >= 10000) popularityScore = 30;
    else if (stars >= 2000) popularityScore = 26;
    else if (stars >= 500) popularityScore = 21;
    else if (stars >= 50) popularityScore = 15;

    // 2. Maintenance Freshness (max 30)
    let activityScore = 5;
    if (daysSincePush <= 7) activityScore = 30;
    else if (daysSincePush <= 30) activityScore = 25;
    else if (daysSincePush <= 90) activityScore = 18;
    else if (daysSincePush <= 180) activityScore = 11;

    // 3. OSS License Compliance (max 20)
    const hasLicense = Boolean(repo.license && repo.license.spdx_id && repo.license.spdx_id !== "NOASSERTION");
    const licenseScore = hasLicense ? 20 : 4;

    // 4. Community & Issue Manageability (max 20)
    const ratio = stars > 0 ? openIssues / stars : openIssues;
    let communityScore = 12;
    if (forks >= 100 && ratio < 0.25) communityScore = 20;
    else if (forks >= 20 && ratio < 0.4) communityScore = 16;
    else if (openIssues === 0) communityScore = 10;

    const total = Math.min(100, popularityScore + activityScore + licenseScore + communityScore);

    let verdict = { label: "High-Trust OSS", badgeClass: "badge-emerald" };
    if (total < 55) verdict = { label: "Needs Caution", badgeClass: "badge-rose" };
    else if (total < 75) verdict = { label: "Moderate Health", badgeClass: "badge-amber" };

    return {
      total,
      verdict,
      breakdown: [
        { label: "Community Traction (Stars)", value: `${popularityScore} / 30` },
        { label: "Commit Freshness", value: `${activityScore} / 30` },
        { label: "Open-Source License", value: `${licenseScore} / 20` },
        { label: "Forks & Issue Hygiene", value: `${communityScore} / 20` },
      ],
    };
  }

  function classifyIssue(issue) {
    const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
    const text = `${issue.title || ""} ${issue.body || ""}`.toLowerCase();

    const isBounty =
      labels.some((l) => /bounty|reward|grant|fund|prize|help wanted/.test(l)) ||
      /\b(bounty|reward|usdc|\$\d+)\b/.test(text);

    const isStarter = labels.some((l) =>
      /good first issue|starter|beginner|easy|documentation|docs/.test(l)
    );

    let difficulty = "Intermediate";
    let difficultyClass = "badge-amber";
    let estimate = "4–8 hrs";

    if (isStarter) {
      difficulty = "Starter";
      difficultyClass = "badge-emerald";
      estimate = "1–3 hrs";
    } else if (
      labels.some((l) => /core|architecture|breaking|security|performance|rfc/.test(l)) ||
      (issue.comments || 0) >= 12
    ) {
      difficulty = "Deep Core";
      difficultyClass = "badge-rose";
      estimate = "1–3 days";
    }

    return { isBounty, isStarter, difficulty, difficultyClass, estimate };
  }

  function buildChecklistSteps(repo, issue) {
    const repoName = repo.full_name;
    const branch = repo.default_branch || "main";
    const lang = repo.language || "project stack";

    if (!issue) {
      return [
        `Fork and clone ${repoName} (${branch} branch) and install dependencies (${lang}).`,
        "Run the existing test suite locally to establish a clean green baseline.",
        "Review CONTRIBUTING.md and pick a 'good first issue' or 'help wanted' ticket.",
        "Implement a minimal, well-scoped patch with unit test coverage.",
        "Open a Pull Request with before/after verification output.",
      ];
    }

    const meta = classifyIssue(issue);
    const steps = [
      `Create feature branch from \`${branch}\`: \`git checkout -b fix/issue-${issue.number}\`.`,
      `Reproduce issue #${issue.number} ("${issue.title}") in local ${lang} test harness.`,
      meta.isStarter
        ? "Locate the target module/docs file and keep the patch minimal and backwards-compatible."
        : "Trace the affected state flow and verify edge cases mentioned in issue comments.",
      `Add or update automated tests covering issue #${issue.number} acceptance criteria.`,
      "Run linter, type-check, and full test suite to confirm zero regressions.",
      `Open PR referencing \`Closes #${issue.number}\` in ${repoName} with clear reproduction notes.`,
    ];

    if (meta.isBounty) {
      steps.push("Attach payout/wallet or GitHub Sponsors claim note per maintainer bounty instructions.");
    }

    return steps;
  }

  function renderChecklist(repo, issue) {
    selectedIssue = issue || null;
    const steps = buildChecklistSteps(repo, issue);

    if (issue) {
      const meta = classifyIssue(issue);
      checklistTargetMeta.innerHTML = `
        Target: <a href="${escapeHtml(issue.html_url)}" target="_blank" rel="noopener noreferrer" style="color:#a5b4fc;font-weight:600;">#${issue.number} ${escapeHtml(issue.title)}</a>
        · <span class="badge ${meta.difficultyClass}">${escapeHtml(meta.difficulty)} (${escapeHtml(meta.estimate)})</span>
      `;
    } else {
      checklistTargetMeta.textContent = `General onboarding checklist for ${repo.full_name} (click any issue to customize).`;
    }

    lastChecklistMarkdown = [
      `## Implementation Plan: ${issue ? `${repo.full_name}#${issue.number}` : repo.full_name}`,
      ...(issue ? [`**Issue:** ${issue.title}`, `**URL:** ${issue.html_url}`, ""] : [""]),
      ...steps.map((s) => `- [ ] ${s}`),
    ].join("\n");

    implementationChecklist.innerHTML = steps
      .map(
        (step, idx) => `
        <label class="checklist-step" data-step="${idx}">
          <input type="checkbox" />
          <span>${escapeHtml(step)}</span>
        </label>`
      )
      .join("");

    implementationChecklist.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.addEventListener("change", (e) => {
        const row = e.target.closest(".checklist-step");
        if (row) row.classList.toggle("done", e.target.checked);
      });
    });
  }

  function renderIssuesList() {
    const filtered = currentIssues.filter((issue) => {
      const meta = classifyIssue(issue);
      if (activeFilter === "starter") return meta.isStarter;
      if (activeFilter === "bounty") return meta.isBounty;
      return true;
    });

    if (filtered.length === 0) {
      issuesList.innerHTML = `
        <div class="status-banner info">
          No open issues matched the "<strong>${escapeHtml(activeFilter)}</strong>" filter. Try "All" or inspect another repo.
        </div>`;
      return;
    }

    issuesList.innerHTML = filtered
      .map((issue) => {
        const meta = classifyIssue(issue);
        const isSelected = selectedIssue && selectedIssue.number === issue.number;
        const labelHtml = (issue.labels || [])
          .slice(0, 3)
          .map((l) => `<span class="label-pill">${escapeHtml(l.name)}</span>`)
          .join("");

        return `
          <button type="button" class="issue-item ${isSelected ? "selected" : ""}" data-issue-number="${issue.number}">
            <div class="issue-top">
              <span class="issue-title">#${issue.number} · ${escapeHtml(issue.title)}</span>
              <span class="badge ${meta.difficultyClass}">${escapeHtml(meta.difficulty)}</span>
            </div>
            <div class="issue-meta">
              <span>Est: ${escapeHtml(meta.estimate)}</span>
              <span>· 💬 ${issue.comments || 0}</span>
              <span>· ${formatRelativeDate(issue.created_at)}</span>
              ${meta.isBounty ? '<span class="badge badge-indigo">Bounty Signal</span>' : ""}
              ${labelHtml}
            </div>
          </button>`;
      })
      .join("");

    issuesList.querySelectorAll(".issue-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = Number(btn.dataset.issueNumber);
        const found = currentIssues.find((item) => item.number === num);
        if (found) {
          renderChecklist(currentRepo, found);
          renderIssuesList();
        }
      });
    });
  }

  function renderAnalysis(repo, issues, focusedIssue = null) {
    currentRepo = repo;
    currentIssues = issues;

    repoTitleLink.textContent = repo.full_name;
    repoTitleLink.href = repo.html_url;
    repoDescription.textContent = repo.description || "No repository description provided.";
    repoLanguageBadge.textContent = repo.language || "Multi-Language";

    metricStars.textContent = formatCompactNumber(repo.stargazers_count || 0);
    metricForks.textContent = formatCompactNumber(repo.forks_count || 0);
    metricIssues.textContent = formatCompactNumber(repo.open_issues_count || 0);
    metricLicense.textContent = repo.license?.spdx_id || "None";
    metricUpdated.textContent = formatRelativeDate(repo.pushed_at);
    metricBranch.textContent = repo.default_branch || "main";

    const health = computeRepoHealth(repo);
    healthScoreNum.textContent = String(health.total);
    healthVerdictBadge.textContent = health.verdict.label;
    healthVerdictBadge.className = `badge ${health.verdict.badgeClass}`;
    healthProgressBar.style.width = `${health.total}%`;
    healthBreakdown.innerHTML = health.breakdown
      .map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`)
      .join("");

    if (focusedIssue) {
      const meta = classifyIssue(focusedIssue);
      focusedIssuePanel.classList.remove("hidden");
      focusedIssuePanel.innerHTML = `
        <h4>Focused Issue #${focusedIssue.number}: ${escapeHtml(focusedIssue.title)}</h4>
        <p>
          Estimated Difficulty: <strong>${escapeHtml(meta.difficulty)}</strong> (${escapeHtml(meta.estimate)}) ·
          State: <strong>${escapeHtml(focusedIssue.state || "open")}</strong> ·
          <a href="${escapeHtml(focusedIssue.html_url)}" target="_blank" rel="noopener noreferrer" style="color:#a5b4fc;text-decoration:underline;">View on GitHub ↗</a>
        </p>`;
    } else {
      focusedIssuePanel.classList.add("hidden");
      focusedIssuePanel.innerHTML = "";
    }

    const defaultIssue = focusedIssue || issues[0] || null;
    renderChecklist(repo, defaultIssue);
    renderIssuesList();

    analyzerResults.classList.remove("hidden");
  }

  async function analyzeTarget(rawTarget) {
    const parsed = parseGitHubTarget(rawTarget);
    if (!parsed) {
      setStatus("Please enter a valid GitHub owner/repo or issue URL (e.g. vercel/next.js).", "error");
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";
    setStatus(`Fetching live metadata for ${parsed.owner}/${parsed.repo} from GitHub API...`, "info");

    try {
      const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      updateRateLimitBadge(repoRes.headers);

      if (!repoRes.ok) {
        if (repoRes.status === 403) {
          throw new Error("GitHub API unauthenticated rate limit reached (60 req/hr). Click 'Load offline snapshot sample' or retry later.");
        }
        if (repoRes.status === 404) {
          throw new Error(`Repository ${parsed.owner}/${parsed.repo} was not found or is private.`);
        }
        throw new Error(`GitHub API returned HTTP ${repoRes.status}.`);
      }

      const repoData = await repoRes.json();

      const issuesRes = await fetch(
        `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/issues?state=open&per_page=25`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      updateRateLimitBadge(issuesRes.headers);

      let issuesData = [];
      if (issuesRes.ok) {
        const rawList = await issuesRes.json();
        issuesData = Array.isArray(rawList) ? rawList.filter((item) => !item.pull_request) : [];
      }

      let focusedIssue = null;
      if (parsed.issueNumber) {
        const singleRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.issueNumber}`,
          { headers: { Accept: "application/vnd.github+json" } }
        );
        if (singleRes.ok) {
          focusedIssue = await singleRes.json();
          if (!issuesData.some((i) => i.number === focusedIssue.number)) {
            issuesData = [focusedIssue, ...issuesData];
          }
        }
      }

      renderAnalysis(repoData, issuesData, focusedIssue);
      setStatus(`Live analysis complete for ${repoData.full_name} (${issuesData.length} open issues scanned).`, "success");
    } catch (err) {
      setStatus(err.message || "Unable to fetch GitHub API data.", "error");
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analyze Repository";
    }
  }

  // Event Listeners - Analyzer
  analyzerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    analyzeTarget(repoInput.value);
  });

  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      repoInput.value = chip.dataset.repo || "";
      analyzeTarget(repoInput.value);
    });
  });

  loadSampleOfflineBtn.addEventListener("click", () => {
    repoInput.value = OFFLINE_SNAPSHOT.repo.full_name;
    renderAnalysis(OFFLINE_SNAPSHOT.repo, OFFLINE_SNAPSHOT.issues, null);
    setStatus("Loaded offline snapshot demo for solana-labs/solana-web3.js.", "success");
  });

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeFilter = pill.dataset.filter || "all";
      renderIssuesList();
    });
  });

  copyChecklistBtn.addEventListener("click", async () => {
    if (!lastChecklistMarkdown) return;
    try {
      await navigator.clipboard.writeText(lastChecklistMarkdown);
      const prev = copyChecklistBtn.textContent;
      copyChecklistBtn.textContent = "Copied!";
      setTimeout(() => {
        copyChecklistBtn.textContent = prev;
      }, 1600);
    } catch {
      setStatus("Clipboard access blocked by browser — select checklist text manually.", "info");
    }
  });

  // Grant Readiness Calculator Logic
  const GRANT_CATALOG = [
    {
      name: "Microsoft for Startups Founders Hub",
      amount: "$1,000 – $25,000+ Cloud & AI Credits",
      url: "https://foundershub.startups.microsoft.com/",
      desc: "Azure credits, OpenAI API credits, GitHub Enterprise perks, and 1:1 technical mentorship without requiring VC backing.",
      scoreMatch: (ctx) => {
        let s = 72;
        if (ctx.stage !== "idea") s += 14;
        if (ctx.focus === "ai_devtools" || ctx.focus === "hybrid_ai_web3" || ctx.focus === "saas_general") s += 10;
        if (ctx.demo === "live_url") s += 4;
        return Math.min(99, s);
      },
    },
    {
      name: "Solana Superteam Micro-Grants",
      amount: "$1,000 – $10,000 USDC (Non-Dilutive)",
      url: "https://superteam.fun/",
      desc: "Fast-turnaround equity-free USDC micro-grants for open-source builders shipping developer tools, bounties, and consumer apps in the Solana ecosystem.",
      scoreMatch: (ctx) => {
        let s = 45;
        if (ctx.focus === "web3_solana" || ctx.focus === "hybrid_ai_web3") s += 38;
        if (ctx.oss !== "closed") s += 10;
        if (ctx.demo === "live_url") s += 5;
        return Math.min(98, s);
      },
    },
    {
      name: "GitHub Sponsors & OSS Micro-Grants",
      amount: "$500 – $5,000+ Recurring / Matching",
      url: "https://github.com/sponsors",
      desc: "Community recurring sponsorships plus ecosystem matching rounds for public MIT/Apache developer tools with clean READMEs and releases.",
      scoreMatch: (ctx) => {
        let s = 35;
        if (ctx.oss === "oss_mit") s += 40;
        if (ctx.oss === "oss_community") s += 55;
        if (ctx.demo !== "none") s += 7;
        return Math.min(97, s);
      },
    },
    {
      name: "DoraHacks & Devpost Global Hackathons",
      amount: "$2,000 – $50,000 Prize Pools",
      url: "https://dorahacks.io/",
      desc: "Continuous online AI & Web3 hackathon tracks rewarding working MVPs, live public URLs, and concise 2-minute demo walkthroughs.",
      scoreMatch: (ctx) => {
        let s = 60;
        if (ctx.stage === "mvp" || ctx.stage === "live") s += 18;
        if (ctx.hasVideo) s += 12;
        if (ctx.demo === "live_url") s += 8;
        return Math.min(98, s);
      },
    },
    {
      name: "Google for Startups Cloud Program",
      amount: "$2,000 – $200,000 Cloud Credits",
      url: "https://cloud.google.com/startup",
      desc: "Cloud & Gemini AI infrastructure credits for early-stage software startups with an active web presence and architecture roadmap.",
      scoreMatch: (ctx) => {
        let s = 54;
        if (ctx.focus === "ai_devtools" || ctx.focus === "saas_general") s += 20;
        if (ctx.stage === "live") s += 14;
        if (ctx.hasRoadmap) s += 8;
        return Math.min(96, s);
      },
    },
  ];

  function updateGrantCalculator() {
    const stage = projectStageEl.value;
    const oss = ossStatusEl.value;
    const focus = ecosystemFocusEl.value;
    const demo = demoStatusEl.value;
    const weeklyHours = Number(weeklyHoursEl.value);
    const fundingTarget = Number(fundingTargetEl.value);
    const hasVideo = hasVideoPitchEl.checked;
    const hasRoadmap = hasRoadmapEl.checked;

    weeklyHoursValEl.textContent = `${weeklyHours} hrs/wk`;
    fundingTargetValEl.textContent = `$${fundingTarget.toLocaleString("en-US")}`;

    let score = 20;
    if (stage === "mvp") score += 20;
    else if (stage === "live") score += 28;
    else score += 8;

    if (oss === "oss_mit") score += 16;
    else if (oss === "oss_community") score += 22;
    else score += 4;

    if (demo === "repo_only") score += 10;
    else if (demo === "live_url") score += 18;

    if (weeklyHours >= 20) score += 6;
    if (hasVideo) score += 6;
    if (hasRoadmap) score += 6;
    if (focus === "hybrid_ai_web3" || focus === "ai_devtools" || focus === "web3_solana") score += 4;

    score = Math.min(100, score);

    let tier = { label: "Early Concept", badgeClass: "badge-amber" };
    if (score >= 80) tier = { label: "Grant-Ready MVP", badgeClass: "badge-emerald" };
    else if (score >= 60) tier = { label: "Competitive Candidate", badgeClass: "badge-indigo" };

    grantScoreNum.textContent = `${score}%`;
    grantTierBadge.textContent = tier.label;
    grantTierBadge.className = `badge ${tier.badgeClass}`;
    grantProgressBar.style.width = `${score}%`;

    const minEst = score >= 80 ? 12000 : score >= 60 ? 5000 : 1000;
    const maxEst = score >= 80 ? 35000 : score >= 60 ? 18000 : 6000;
    estimatedFundingRange.textContent = `$${minEst.toLocaleString("en-US")} – $${maxEst.toLocaleString("en-US")}+`;

    const gaps = [];
    if (oss === "closed") gaps.push("Publish an MIT/Apache-2.0 repo to unlock GitHub Sponsors & OSS micro-grants.");
    if (demo !== "live_url") gaps.push("Deploy a live static demo URL (GitHub Pages/Vercel) — reviewers test links in <60s.");
    if (!hasVideo) gaps.push("Record a 2-minute walkthrough video for DoraHacks/Devpost & Superteam reviewers.");
    if (!hasRoadmap) gaps.push("Add a 90-day milestone table showing how grant funds translate into shipped features.");

    readinessActionTips.innerHTML = gaps.length
      ? `<strong>Top improvements to boost approval odds:</strong><ul style="margin:0.4rem 0 0;padding-left:1.2rem;">${gaps
          .map((g) => `<li>${escapeHtml(g)}</li>`)
          .join("")}</ul>`
      : "<strong>Strong profile!</strong> You meet the core criteria (public demo, OSS repo, video pitch, and milestone roadmap) for immediate grant submission.";

    const ctx = { stage, oss, focus, demo, weeklyHours, fundingTarget, hasVideo, hasRoadmap };
    const ranked = GRANT_CATALOG.map((g) => ({ ...g, match: g.scoreMatch(ctx) })).sort(
      (a, b) => b.match - a.match
    );

    matchedGrantsList.innerHTML = ranked
      .map(
        (g) => `
        <article class="grant-card">
          <div class="grant-card-top">
            <span class="grant-name">${escapeHtml(g.name)}</span>
            <span class="grant-amount">${escapeHtml(g.amount)}</span>
          </div>
          <p class="grant-desc">${escapeHtml(g.desc)}</p>
          <div class="grant-card-foot">
            <span class="grant-match-label">${g.match}% Eligibility Fit</span>
            <a href="${escapeHtml(g.url)}" target="_blank" rel="noopener noreferrer" class="grant-link">
              Open Application Portal ↗
            </a>
          </div>
        </article>`
      )
      .join("");
  }

  [
    projectStageEl,
    ossStatusEl,
    ecosystemFocusEl,
    demoStatusEl,
    weeklyHoursEl,
    fundingTargetEl,
    hasVideoPitchEl,
    hasRoadmapEl,
  ].forEach((el) => {
    el.addEventListener("input", updateGrantCalculator);
    el.addEventListener("change", updateGrantCalculator);
  });

  // Initial state on load
  updateGrantCalculator();
  // Render offline snapshot immediately so the workspace feels rich even before the first live fetch,
  // while also attempting a live fetch if online.
  renderAnalysis(OFFLINE_SNAPSHOT.repo, OFFLINE_SNAPSHOT.issues, null);
  setStatus("Showing instant preview snapshot. Click 'Analyze Repository' or any quick-try chip for live GitHub API data.", "info");
})();
