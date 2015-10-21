var usage = require('../lib/usage.js')('start.txt')
var BuildServer = require('../lib/server.js')

module.exports = {
  name: 'start',
  command: startServer,
  options: []
}

function startServer (args) {

  if (args.help) return usage()

  var apiKey = args.apiKey
  var server = new BuildServer(args)
  server.start()
}
