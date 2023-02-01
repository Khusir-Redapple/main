let Logger = require('logdna');
let options = {};
// Defaults to false, when true ensures meta object will be searchable
options.index_meta = true;

console.log('LOGDNA API::KEY:: ', `${process.env.LOG_DNA_API_KEY}`);
// Create multiple loggers with different options
let logger = Logger.createLogger(`${process.env.LOG_DNA_API_KEY}`, options);
// export the logger
module.exports = logger;
