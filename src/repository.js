/*!
 * Copyright (C) 2017 Glayzzle (BSD3 License)
 * @authors https://github.com/glayzzle/php-reflection/graphs/contributors
 * @url http://glayzzle.com
 */
'use strict';

var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var globToRegExp = require('glob-to-regexp');
var node = require('./data/node');
var file = require('./nodes/file');
var block = require('./nodes/block');
var defaultOptions = require('./repository/options');

/**
 *
 * The repository stores a list of files with their symbols
 * and acts like a database.
 *
 * You can request it to retrieve
 * [nodes](NODE.md) like [namespaces](NAMESPACE.md], functions or classes.
 *
 * You can also use it to retrieve scope context from a specific
 * offset (usefull for an editor).
 *
 * @public
 * @constructor {repository}
 * @property {Object} files
 * @property {Object} options
 * @property {String} directory
 * @property {Object} counter
 */
var repository = function(directory, options) {
  // direct function call
  if (typeof this === 'function') {
    return new this(directory, options);
  }
  this.files = {};

  // extends options
  this.options = {};
  for(var k in defaultOptions) {
    this.options[k] = options && k in options ? options[k] : defaultOptions[k];
  }

  // prepare extension filters
  this._regex = [];
  for (var i = 0; i < this.options.ext.length; i++) {
    this._regex.push(
      globToRegExp(
        this.options.ext[i]
      )
    );
  }

  // counting things
  this.counter = {
    total: 0,
    loading: 0,
    loaded: 0,
    error: 0,
    symbols: 0,
    size: 0
  };
  this.directory = path.resolve(directory);

  // init EventEmitter
  EventEmitter.call(this);
};
util.inherits(repository, EventEmitter);

/**
 * Starts to read a file in order to parse it. This event is emited from
 * parse or refresh methods.
 *
 * @event repository#read
 * @type {object}
 * @property {string} name - The filename that will be parsed
 */


/**
 * Cache hit event, file is already updated
 *
 * @event repository#cache
 * @type {object}
 * @property {string} name - The filename that was found in cache
 */

/**
 * The specified file is parsed.
 *
 * @event repository#parse
 * @type {object}
 * @property {string} name - The filename that will be parsed
 * @property {file} file - The file
 */

/**
 *
 *
 * @event repository#error
 * @type {object}
 * @property {string} name - The filename that triggered the error
 * @property {object} error - The reaised error object
 */


/**
 * Scan the current directory to add PHP files to parser
 * @public
 * @param {String|Array} directory Path to scan, relative to repository root
 * @return {Promise}
 * @fires repository#progress
 * @fires repository#cache
 */
repository.prototype.scan = require('./repository/scan');

/**
 * Parsing a file
 * @public
 * @param {string} filename
 * @param {string} encoding The encoding (by default utf8)
 * @return {Promise}
 * @fires repository#read
 * @fires repository#parse
 * @fires repository#error
 * @fires repository#cache
 */
repository.prototype.parse = require('./repository/parse');

/**
 * Lookup at each file and retrieves specified nodes
 * @param {String} type
 * @param {Number} limit
 * @return {node[]} {@link NODE.md|:link:}
 */
repository.prototype.getByType = function(type, limit) {
  if (!limit) limit = 100;
  var result = [];
  for (var k in this.files) {
    if (this.files[k] instanceof file) {
      result = result.concat(this.files[k].getByType(type));
      if (limit > 0 && result.length > limit) {
        result = result.slice(0, limit);
        break;
      }
    }
  }
  return result;
}

/**
 * Lookup at each file and retrieves named elements
 * @param {String} type
 * @param {Number} limit
 * @return {node[]} {@link NODE.md|:link:}
 */
repository.prototype.getByName = function(type, name, limit) {
  var result = [];
  for (var k in this.files) {
    if (this.files[k] instanceof file) {
      var items = this.files[k].getByName(type, name, limit);
      if (items.length > 0) {
        result = result.concat(items);
      }
    }
  }
  return result;
};

/**
 * Lookup at each file and retrieves named elements
 * @param {String} type
 * @param {Number} limit
 * @return {node|null} {@link NODE.md|:link:}
 */
repository.prototype.getFirstByName = function(type, name) {
  var result = null;
  for (var k in this.files) {
    if (this.files[k] instanceof file) {
      result = this.files[k].getFirstByName(type, name);
      if (result) return result;
    }
  }
  return null;
};

/**
 * Retrieves a namespace (cross file)
 *
 * The retrieved namespace will include :
 * - constants
 * - functions
 * - classes
 * - interfaces
 * - traits
 *
 * @param {String} name The namespace name
 * @return {namespace|null} {@link NAMESPACE.md|:link:}
 */
repository.prototype.getNamespace = function(name) {
  if (name[0] !== '\\')
    name = '\\' + name;
  if (name.length > 1 && name.substring(-1) === '\\') {
    name = name.substring(0, name.length - 1);
  }
  var items = this.getByName('namespace', name);
  if (items.length > 0) {
    var result = node.create('namespace');
    items.forEach(function(ns) {
      if (ns.constants.length > 0) {
        result.constants = result.constants.concat(ns.constants);
      }
      if (ns.functions.length > 0) {
        result.functions = result.functions.concat(ns.functions);
      }
      if (ns.classes.length > 0) {
        result.classes = result.classes.concat(ns.classes);
      }
      if (ns.traits.length > 0) {
        result.traits = result.traits.concat(ns.traits);
      }
      if (ns.interfaces.length > 0) {
        result.interfaces = result.interfaces.concat(ns.interfaces);
      }
    });
    return result;
  } else {
    return null;
  }
};

/**
 * Synchronize with specified offset
 * @return {boolean|Error} True is node was synced, or Error object if fail
 */
repository.prototype.sync = require('./repository/sync');


/**
 * Clean all the cache
 * @public
 * @return {repository}
 */
repository.prototype.cleanAll = function() {
  this.files = {};
  return this;
};

/**
 * Removes a file
 * @public
 * @return {repository}
 */
repository.prototype.remove = function(filename) {
  if (this.files.hasOwnProperty(filename)) {
    if (this.files[filename] instanceof file) {
      this.files[filename].remove();
    }
    delete this.files[filename];
  }
  return this;
};

/**
 * Iterate over each file
 * @public
 * @param {function} cb A closure : `function(file, name)`
 * @return {repository}
 */
repository.prototype.each = function(cb) {
  for (var name in this.files) {
    if (this.files[name] instanceof file) {
      cb.apply(this, this.files[name], name);
    }
  }
  return this;
};

/**
 * Gets the scope for the specified offset
 * @public
 * @return {scope}
 */
repository.prototype.scope = function(filename, offset) {
  if (
    this.files.hasOwnProperty(filename) &&
    this.files[filename] instanceof file
  ) {
    return this.files[filename].getScope(offset);
  } else {
    return null;
  }
};

/**
 * Retrieves a file object
 * @public
 * @param {String} filename The filename to retrieve
 * @return {file|null} Returns the file if exists, or null if not defined
 */
repository.prototype.get = function(filename) {
  if (
    this.files.hasOwnProperty(filename) &&
    this.files[filename] instanceof file
  ) {
    return this.files[filename];
  } else {
    return null;
  }
};


/**
 * Gets/Sets the files repository
 * @public
 * @param {object} data Sets the specified data
 * @return {repository|object} Retrieves the cache (if data not set)
 */
repository.prototype.cache = function(data) {
  if (typeof data !== 'undefined') {
    // sets the data
    this.files = {};
    if (data) {
      this.directory = data.directory;
      // creating files from structure
      for (var name in data.files) {
        this.files[name] = file.import(this, data[name]);
      }
      // rebuild object links
      for (var name in this.files) {
        this.files[name].refresh();
      }
    }
    return this;
  } else {
    // gets the data
    var result = {
      directory: this.directory,
      files: {}
    };
    for (var name in this.files) {
      if (this.files[name] instanceof file) {
        result.files[name] = this.files[name].export();
      }
    }
    return result;
  }
};

/**
 * Rename a file
 * @public
 * @param {string} oldName The original filename
 * @param {string} newName The new filename
 * @return {repository}
 */
repository.prototype.rename = function(oldName, newName) {
  if (this.files.hasOwnProperty(oldName)) {
    this.files[newName] = this.files[oldName];
    this.files[newName].name = newName;
    delete this.files[oldName];
  }
  return this;
};


/**
 * Refresh the file contents
 * @public
 * @return {Promise}
 */
repository.prototype.refresh = function(filename, encoding, stat) {
  if (!this.files.hasOwnProperty(filename)) {
    return this.parse(filename, encoding, stat);
  } else {
    if (this.files[filename] instanceof Promise) {
      return this.files[filename];
    }
    /*var self = this;
    var crc32 = this.options.cacheByFileHash ?
      this.files[filename].crc32 : null;
    this.files[filename] = new Promise(function(done, reject) {
      fs.readFile(
        path.join(self.directory, filename),
        encoding, function(err, data) {
          // @todo
          done();
        });
    });*/
    return new Promise(function(done, reject) {
      done(); // this.files[filename];
    });
  }
};

module.exports = repository;
