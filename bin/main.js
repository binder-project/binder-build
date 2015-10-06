var usage = require('../lib/usage.js')('main.txt')

module.exports = function (args) {

  if (args.version) return console.log(require('../package.json').version)
  if (args.help) return usage()
  if (args._.length < 1) return usage()

  console.log('executing build')
  console.log(args)
  
}