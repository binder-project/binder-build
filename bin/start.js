var usage = require('../lib/usage.js')('start.txt')

module.exports = {
  name: 'start',
  command: server,
  options: []
}

function server (args) {

  if (args.help) return usage()

  console.log('starting server')
  console.log(args)

}