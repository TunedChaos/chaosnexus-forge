// chaosnexus-forge/scripts/generate-frontend-licenses.mjs
//
// Enriches `pnpm licenses list --json` with full license text read from each
// package directory. pnpm only emits SPDX identifiers and metadata.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FRONTEND_ROOT = resolve(__dirname, "..");
const DEFAULT_OUTPUT = resolve(DEFAULT_FRONTEND_ROOT, "src/lib/assets/frontend-licenses.json");

const FRONTEND_ROOT = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_FRONTEND_ROOT;
const OUTPUT = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_OUTPUT;
const LICENSE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENSE-MIT",
  "LICENSE-MIT.txt",
  "LICENCE",
  "LICENCE.md",
  "license",
  "License",
  "COPYING",
  "COPYING.txt",
];

/** Minimal SPDX fallbacks when a package ships no license file. */
const SPDX_FALLBACK = {
  MIT: "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.",
  ISC: "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.",
  "BSD-2-Clause":
    "Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.",
  "BSD-3-Clause":
    "Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.",
  "Apache-2.0":
    "Licensed under the Apache License, Version 2.0 (the \"License\"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.",
};

/**
 * Read the first readable license file from a package install path.
 * @param {string} packagePath
 * @returns {string | undefined}
 */
function readLicenseText(packagePath) {
  for (const candidate of LICENSE_CANDIDATES) {
    const fullPath = join(packagePath, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      const text = readFileSync(fullPath, "utf8").trim();
      if (text.length > 0) return text;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

/**
 * Resolve license text for one pnpm license entry.
 * @param {Record<string, unknown>} pkg
 * @param {string} licenseName
 * @returns {string}
 */
function resolveLicenseText(pkg, licenseName) {
  const paths = Array.isArray(pkg.paths) ? pkg.paths : [];
  for (const rawPath of paths) {
    if (typeof rawPath !== "string") continue;
    const fromDisk = readLicenseText(rawPath);
    if (fromDisk) return fromDisk;
  }

  const spdx =
    (typeof pkg.license === "string" && pkg.license) || licenseName;
  const normalized = spdx.replace(/\s+/g, "").toUpperCase();
  if (normalized === "APACHE-2.0" || normalized === "APACHE2.0") {
    return SPDX_FALLBACK["Apache-2.0"];
  }
  if (SPDX_FALLBACK[spdx]) return SPDX_FALLBACK[spdx];

  return `License: ${spdx}\n\nFull license text was not found in the installed package. See the package repository for the complete terms.`;
}

function main() {
  const raw = execFileSync("pnpm", ["licenses", "list", "--json"], {
    cwd: FRONTEND_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  /** @type {Record<string, unknown[]>} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  const enriched = {};
  let total = 0;
  let fromDisk = 0;

  for (const [licenseName, packages] of Object.entries(data)) {
    if (!Array.isArray(packages)) continue;
    enriched[licenseName] = packages.map((pkg) => {
      total += 1;
      const licenseText = resolveLicenseText(pkg, licenseName);
      const paths = Array.isArray(pkg.paths) ? pkg.paths : [];
      const hadDisk =
        paths.length > 0 &&
        typeof paths[0] === "string" &&
        readLicenseText(paths[0]) !== undefined;
      if (hadDisk) fromDisk += 1;
      return { ...pkg, licenseText };
    });
  }

  writeFileSync(OUTPUT, `${JSON.stringify(enriched, null, 2)}\n`);

  console.log(
    `Wrote ${OUTPUT} (${total} packages, ${fromDisk} license files read from disk).`,
  );
}

main();
