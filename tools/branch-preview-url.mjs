import { execFileSync } from "node:child_process";

const REPOSITORY = "CigThePig/Fish_view";
const DEFAULT_PAGE = "behaviors.html";

function optionValue(argumentsList, name, fallback) {
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

function currentCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function safePage(value) {
  const page = value || DEFAULT_PAGE;
  if (!/^[a-zA-Z0-9._/-]+\.html$/.test(page) || page.includes("..")) {
    throw new Error("--page must be a repository-relative .html path");
  }
  return page.replace(/^\/+/, "");
}

function buildQuery(argumentsList) {
  const query = new URLSearchParams();
  for (const key of ["activity", "seed"]) {
    const value = optionValue(argumentsList, `--${key}`, null);
    if (value) query.set(key, value);
  }
  return query.toString();
}

const argumentsList = process.argv.slice(2);
const ref = optionValue(argumentsList, "--ref", currentCommit());
if (!ref) throw new Error("Could not determine a ref. Pass --ref=<branch-or-commit>.");
const page = safePage(optionValue(argumentsList, "--page", DEFAULT_PAGE));
const query = buildQuery(argumentsList);
const suffix = query ? `?${query}` : "";
const exact = `https://raw.githack.com/${REPOSITORY}/${encodeURIComponent(ref)}/${page}${suffix}`;
const github = `https://github.com/${REPOSITORY}/blob/${encodeURIComponent(ref)}/${page}`;

console.log("Working-branch visual preview");
console.log(`Exact ref: ${ref}`);
console.log(`Preview:   ${exact}`);
console.log(`Source:    ${github}`);
console.log("");
console.log("The normal GitHub Pages site is the main deployment and will not show this ref.");
console.log("raw.githack is a third-party development proxy that serves GitHub files with browser-safe MIME types. Use the exact commit URL above for review; CI artifacts are the fallback if that service is unavailable.");
