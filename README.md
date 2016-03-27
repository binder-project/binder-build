# binder-build
Build Binder images from repositories

`binder-build` implements the `build` section of the Binder API defined in [the Binder
protocol](http://github.com/binder-project/binder-protocol/blob/master/index.js).

### install

The simplest way to run the `binder-build` server is through the
[`binder-control`](https://github.com/binder-project/binder-control) module, which
manages the server's lifecycle and service (the database and logging system) dependencies. In
`binder-control`, the build server can be started with with custom configuration parameters through
```
binder-control build start --api-key=<key> --config=/path/to/config
```

It will also be started with reasonable defaults through
```
binder-control start-all
```

If you'd prefer to use `binder-build` in standalone mode:
```
git clone git@github.com:binder-project/binder-build
cd binder-build
npm i && npm start
```

In standalone mode, the configuration will be loaded from `conf/main.json`

### api

`binder-build` exposes both the `build` and `registry` portions of the Binder API, which are
composed of the following endpoints:

#### `build`

#### `registry`

## usage

The best way to interact with the build server is through the
[`binder-client`](http://github.com/binder-project/binder-client). Once the client has been
installed, all endpoints are accessible either programmatically or through the CLI. For example:

From JS
```
var binder = require('binder-client')
binder.build.status(<build options>, function (err, status) {
  ...
})
```

From the CLI
```
binder build status <image-name> --api-key=<key> --host=<host> --port=<port>
```
