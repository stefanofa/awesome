import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HEADER_BADGE =
  "[![Awesome](https://cdn.rawgit.com/sindresorhus/awesome/d7305f38d29fed78fa85652e3a63e154dd8e8829/media/badge.svg)](https://github.com/sindresorhus/awesome)";



function slugBase(value) {
  return value.toLowerCase().replace(/[^\w\s-]/g, "").replace(/ /g, "-");
}

class Slugger {
  constructor() {
    this.occurrences = Object.create(null);
  }

  slug(value) {
    let result = slugBase(value);
    const original = result;
    while (Object.prototype.hasOwnProperty.call(this.occurrences, result)) {
      this.occurrences[original] += 1;
      result = `${original}-${this.occurrences[original]}`;
    }
    this.occurrences[result] = 0;
    return result;
  }
}

function header(username) {
  return `# 🌟 ${username}'s stars ${HEADER_BADGE}`;
}

function escapeText(text) {
  const spans = [];
  const parked = text.replace(/`[^`]*`/g, (span) => {
    const inner = span.slice(1, -1).replaceAll("&", "&amp;");
    spans.push(`\`${inner}\``);
    return `\u0000${spans.length - 1}\u0000`;
  });
  const escaped = parked.replace(/[_*<[]/g, (char) => `\\${char}`);
  return escaped.replace(/\u0000(\d+)\u0000/g, (_, index) => spans[Number(index)]);
}

function item(repo) {
  const description =
    repo.description == null
      ? ""
      : escapeText(String(repo.description).replace(/[\r\n]+/g, " ").trimEnd());
  const line = `* [${escapeText(repo.full_name)}](${repo.html_url}) -`;
  return description ? `${line} ${description}` : line;
}

function render(username, sections) {
  const title = header(username);
  const slugger = new Slugger();
  slugger.slug(title.slice(2));
  slugger.slug("Table of Contents");

  const toc = [];
  const body = [];
  sections.forEach(([name, repos], sectionIndex) => {
    toc.push(`* [${name}](#${slugger.slug(name)})`);
    body.push(`## ${name.replaceAll("#", "\\#")}`, "");
    repos.forEach((repo, repoIndex) => {
      body.push(item(repo));
      const last =
        sectionIndex === sections.length - 1 && repoIndex === repos.length - 1;
      if (!last) body.push("");
    });
  });

  return [title, "", "## Table of Contents", "", ...toc, "", ...body].join("\n") + "\n";
}

function group(repos, keyFor) {
  const groups = new Map();
  for (const repo of repos) {
    const keys = keyFor(repo);
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(repo);
    }
  }
  return [...groups.entries()];
}

export function pick(repo) {
  return {
    id: repo.id,
    node_id: repo.node_id,
    name: repo.name,
    full_name: repo.full_name,
    owner: {
      login: repo.owner.login,
      id: repo.owner.id,
      avatar_url: repo.owner.avatar_url,
      url: repo.owner.url,
      html_url: repo.owner.html_url,
    },
    html_url: repo.html_url,
    description: repo.description,
    url: repo.url,
    languages_url: repo.languages_url,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    git_url: repo.git_url,
    ssh_url: repo.ssh_url,
    clone_url: repo.clone_url,
    homepage: repo.homepage,
    stargazers_count: repo.stargazers_count,
    watchers_count: repo.watchers_count,
    language: repo.language,
    topics: repo.topics ?? [],
  };
}

export function build(username, repos) {
  const slim = repos.map(pick);
  const byLanguage = group(slim, (repo) => [repo.language || "miscellaneous"]);
  const byTopic = group(slim, (repo) =>
    repo.topics.length ? repo.topics : ["miscellaneous"],
  );
  const data = Object.fromEntries(byLanguage);
  return {
    readme: render(username, byLanguage),
    topics: render(username, byTopic),
    data: JSON.stringify(data, null, 2),
  };
}

async function fetchStarred(username, token) {
  const repos = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "stefanofa-awesome",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub starred list failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

async function main() {
  const username = process.env.GITHUB_REPOSITORY_OWNER || "stefanofa";
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set GH_TOKEN or GITHUB_TOKEN");

  const repos = await fetchStarred(username, token);
  if (repos.length === 0) throw new Error(`No starred repositories for ${username}`);

  const root = process.cwd();
  const { readme, topics, data } = build(username, repos);
  fs.writeFileSync(path.join(root, "README.md"), readme);
  fs.writeFileSync(path.join(root, "TOPICS.md"), topics);
  fs.writeFileSync(path.join(root, "data.json"), data);
  console.log(`Wrote ${repos.length} starred repositories`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
