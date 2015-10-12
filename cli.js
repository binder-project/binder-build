var subcommand = require('subcommand')

module.exports = function(args) {

	var config = {
	  commands: [
	    require('./bin/start.js'),
      require('./bin/stop.js')
	  ],
	  defaults: require('./bin/defaults.js'),
	  none: require('./bin/main.js')
	}

	var route = subcommand(config)
	route(args.slice(2))

}
