#!/usr/bin/env node

require('colors');
const { Command } = require('commander');
const setup_extract = require('./commands/extract.js');
const { version } = require('../package.json');

(async () => {
    try {
        const program = new Command();
        program.name('keywords')
            .description('extract keywords from all the text files found in the target directory')
            .version(version);

        await setup_extract({
            program
        });

        program.parse(process.argv);
    } catch (err) {
        console.error(`${'error:'.red} ${err.message}`);
        process.exit(1);
    }
})();
