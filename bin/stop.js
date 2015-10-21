var usage = require('../lib/usage.js')('stop.txt')
var server = require('../lib/server.js')

module.exports = {
  name: 'stop',
  command: stopServer,
  options: []
}

function stopServer (args) {

  if (args.help) return usage()
  
  console.log('stopping server')
  console.log(args)

}
