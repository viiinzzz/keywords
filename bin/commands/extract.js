require('colors');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const globbyPromise = import('globby');
const sort = require('sort-array');
const isBinaryFile = require("isbinaryfile").isBinaryFile;

const debug = false;

module.exports = async function setup({
  program,
}) {
  program.command('extract')
    .alias('x')
    .description('extract words from the text files in the target directory')
    // .option('--debug', 'debug', false)
    .option(
      '-o, --output [path]',
      'file to put words in',
      './word-list.js',
    )
    .option(
      '-c, --case [string]',
      'returns changed case (lower, original)',
      'lower',
    )
    .option(
      '-cc, --chain [string]',
      'returns chained words (join, split)',
      'join',
    )
    .option(
      '-n, --minlen [number]',
      'minimum word length',
      '3',
    )
    .option(
      '-m, --maxcount [number]',
      'maximum word count',
      '100',
    )
    .argument(
      '<targetDir>',
      'directory to scan',
    )
    .action(async (argument, options) => {
      const stopwordsDir = path.join(__dirname, '../../stopwords');
      const targetDir = !argument ? process.cwd()
        : argument.startsWith('.') ? path.join(process.cwd(), argument)
          : argument;
      console.log(`scanning: ${targetDir}`);
      (async () => {
        try {
          const stopwords = await loadStopwords({
            targetDir: stopwordsDir,
          })
          await scan({
            targetDir,
            options: {
              stopwords,
              return_change_case: options.case === 'lower' ? true : options.case === 'original' ? false : undefined,
              return_chained_words: options.chain === 'join' ? true : options.chain === 'split' ? false : undefined,
              minlen: Number.isInteger(Number.parseInt(options.minlen)) && Number.parseInt(options.minlen) >= 0 ? options.minlen : 0,
              maxcount: Number.isInteger(Number.parseInt(options.maxcount)) && Number.parseInt(options.maxcount) > 0 ? options.maxcount : 100,
            }
          });
        } catch (err) {
          console.error(`${'error:'.red} ${err.message}`, err);
          process.exit(1);
        }
      })();
    });
};

// const glue_union = (text) => text.replace(/[_-֊־᐀᠆‐‑‒–—―⸗⸚⸺⸻⹀〜〰゠︱︲﹘﹣－]+/ug, '_');
const glue_union = (text) => text.replace(/[_-]+/ug, '_');

const loadStopwords = async ({ targetDir }) => {
  if (!fs.existsSync(targetDir)
    || !(await fsp.lstat(targetDir)).isDirectory()
  )
    throw new Error(`invalid directory: ${targetDir}`);
  const globby = (await globbyPromise).globby;
  const pattern = `${targetDir.replace(/\\/g, '/')}/**/*.txt`;
  const files = await globby([pattern]);
  const arr = await files.reduce((lastPromise, file) =>
    lastPromise.then(async (last) => {
      const relpath = file.substring(targetDir.length);
      // console.log(`stopwords: ${relpath}`.gray);
      const text = (await fsp.readFile(file)).toString()
      const next = text.split(/[\r\n]/)
        .map((word) => glue_union(word));
      return [...last, ...next];
    }),
    Promise.resolve([])
  );
  const dic = {};
  arr.forEach((word) => dic[word] = true);
  if (debug) console.log(`stopwords:`, dic);
  return dic;
}

const scan = async ({
  targetDir,
  options,
}) => {
  if (!fs.existsSync(targetDir)
    || !(await fsp.lstat(targetDir)).isDirectory()
  )
    throw new Error(`invalid directory: ${targetDir}`);
  if (debug) console.log({ options });
  const maxcount = (arr) => {
    if (arr.length > options.maxcount) arr.length = options.maxcount;
    return arr;
  }
  if (debug) console.log(options.stopwords)
  const stop = (word) => options.stopwords[word];
  const minlen = (word) => options.minlen > 0 ? (word.length >= options.minlen) : true;
  const keep_letters_only = (text) => text.replace(/\p{Z}+/ug, ' ').replace(/(\P{L}|_)+/ug, ' ');
  const return_change_case = (text) => options.return_change_case ? `${text}`.toLowerCase() : text;
  const clean = (text) => return_change_case(keep_letters_only(glue_union(text)));
  const globby = (await globbyPromise).globby;
  const pattern = `${targetDir.replace(/\\/g, '/')}/./**/*`;
  const files = await globby([pattern]);
  const keywords = await files.reduce((lastPromise, file) =>
    lastPromise.then(async (last) => {
      try {
        const relpath = file.substring(targetDir.length);
        const stat = fs.lstatSync(file);
        const data = await fsp.readFile(file);
        if (await isBinaryFile(data, stat.size)) {
          if (debug) console.log(`${relpath}`.gray);
        }
        else {
          console.log(`${relpath}`);

          const next = clean(data.toString())
            .split(' ')
            .filter((word) => !stop(word) && minlen(word));
          if (debug) console.log(next.join('/').gray);
          next.map((word) => {
            const prev = last[word];
            if (!prev) {
              last[word] = 1;
            } else {
              last[word] = prev + 1;
            }
          });

        }
      } catch (err) {
        console.error(`${'error:'.red} ${err.message}`, err);
      }
      return last;
    }),
    Promise.resolve({})
  );
  
  const top = Object.fromEntries(maxcount(sort(
    Object.entries(keywords).map(([word, count]) => ({ word, count })),
    { by: 'count', order: 'desc' }
  )).map(({ word, count }) => ([word, count])));
  console.log(`top-${options.maxcount} ${options.minlen}+keywords:`, top);
}
