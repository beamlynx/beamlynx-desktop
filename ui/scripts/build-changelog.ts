// Writes utils/changelog.generated.json, What's New's entries, from the
// app's changelog (../desktop/CHANGELOG.md). npm runs it before `dev`,
// `build`, `type-check` and `test`.
//
// The desktop build stages a copy of ui/ that can't see ../desktop, so it
// runs this in the real ui/ first (desktop/scripts/build-ui-export.sh). In
// that copy the changelog is missing but the generated file was copied
// along, so this keeps it.
import * as fs from 'fs';
import * as path from 'path';
import { parseChangelog } from '../utils/parseChangelog';

const root = path.join(__dirname, '..');
const source = path.join(root, '..', 'desktop', 'CHANGELOG.md');
const output = path.join(root, 'utils', 'changelog.generated.json');

if (!fs.existsSync(source)) {
  if (fs.existsSync(output)) {
    console.log(`build-changelog: ${source} isn't here; keeping the copied ${path.basename(output)}.`);
    process.exit(0);
  }
  console.error(`build-changelog: ${source} is missing, and there is no ${path.basename(output)} to keep.`);
  process.exit(1);
}

const versions = parseChangelog(fs.readFileSync(source, 'utf8'));
if (versions.length === 0) {
  console.error(`build-changelog: found no released versions in ${source}.`);
  process.exit(1);
}
const json = JSON.stringify(versions, null, 2) + '\n';
// Unchanged: leave the file alone, so `next dev` doesn't reload for nothing.
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== json) fs.writeFileSync(output, json);
