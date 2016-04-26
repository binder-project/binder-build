# binder-build
Build Binder images from repositories

## building an image from a repository

`binder-build` implements the `build` section of the Binder API defined in [the Binder
protocol](http://github.com/binder-project/binder-protocol/blob/master/index.js).

The build server is responsible for converting the contents of GitHub repositories, or other
sources, into Binder-compatible Docker images and associated runtime information (such as resource
limits and hardware requirements). To do this, `binder-build` will search for configuration files in
the repository and will select the most appropriate file to build from based on this prioritization
(listed below in descending order; see (TODO: link) for complete descriptions of all configuration files):
  1. `requirements.txt`
  2. `environment.yml`
  3. `Dockerfile`

Once an image has been constructed from the repo contents, it can optionally be pushed to a Docker
repository so that it will be accessible from any deployment backends. In our production
environment, all images are pushed to the Google Container Registry.

The list of accepted image sources (currently only GitHub) can be extended by adding a handler to
[`lib/sources`](lib/sources).

## constructing a template from an image

Docker images do not necessarily contain enough information about a Binder's runtime environment
to properly it onto a container management system. As one example, resource limits and/or hardware
constraints (such as a GPU requirement), need to be stored as additional metadata. With Binder,
we construct a *template* from an image name and this auxilliary information, and we consider this to
a fully-deployable environment specification.

Templates are automatically constructed with reasonable defaults when a build is started. The `template` API 
provides an interface for fetching all templates available for deployment, as well as for fetching a single template.

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

#### build

-----------------------------

Start a new build

```
POST /builds/repo HTTP 1.1
Content-Type: application/json
Authorization: 880df8bbabdf4b48f412208938c220fe
{
  "repository": "https://github.com/binder-project/example-requirements"
}

```
*returns*
```
{
  "name": "binder-project-example-requirements",
  "repo": "https://github.com/binder-project/example-requirements",
  "phase": "fetching",
  "status": "running",
  "start-time": "2016-03-25T05:42:47.315Z"
}
```

--------------------------------

Get the status of all builds
```
GET /builds/ HTTP 1.1
Authorization: 880df8bbabdf4b48f412208938c220fe
```

*returns*

```
 [
  {
    "name": "binder-project-example-requirements",
    "start-time": "2016-03-25T05:42:47.315Z",
    "status": "completed",
    "phase": "finished",
    "repository": "http://github.com/binder-project/example-requirements"
  },
  ...
  {
    "name": "binder-project-example-dockerfile",
    "start-time": "2016-03-25T03:48:29.635Z",
    "status": "completed",
    "phase": "finished",
    "repository": "http://github.com/binder-project/example-dockerfile"
  }
]
```

-------------------------------------

Get the status of a single build
```
GET /builds/binder-project-example-requirements HTTP 1.1
```

*returns*

```
{
  "name": "binder-project-example-requirements",
  "start-time": "2016-03-25T05:42:47.315Z",
  "status": "completed",
  "phase": "finished",
  "repository": "http://github.com/binder-project/example-requirements"
}
```

#### registry

-------------------------------

Get all templates

```
GET /templates/ HTTP 1.1
Authorization: 880df8bbabdf4b48f412208938c220fe
```

*returns*

```
[
  {
    "port": 8888,
    "image-source": "gcr.io/binder-testing/binder-project-example-requirements",
    "name": "binder-project-example-requirements",
    "image-name": "binder-project-example-requirements",
    "command": [],
    "time-modified": "2016-03-28T18:55:54.631Z",
    "time-created": "2016-03-28T18:55:54.631Z",
    "services": []
  },
  {
    "port": 8888,
    "image-source": "gcr.io/binder-testing/binder-project-example-dockerfile",
    "name": "binder-project-example-dockerfile",
    "image-name": "binder-project-example-dockerfile",
    "command": [],
    "time-modified": "2016-03-28T18:55:54.632Z",
    "time-created": "2016-03-28T18:55:54.632Z",
    "services": []
  }
]
```

----------------------------

Get a single template

```
GET /templates/binder-project-example-requirements HTTP 1.1
```

*returns*

```
{
  "port": 8888,
  "image-source": "gcr.io/binder-testing/binder-project-example-dockerfile",
  "name": "binder-project-example-dockerfile",
  "image-name": "binder-project-example-dockerfile",
  "command": [],
  "time-modified": "2016-03-28T18:55:54.632Z",
  "time-created": "2016-03-28T18:55:54.632Z",
  "services": []
}
```
---------------------------------------------

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
