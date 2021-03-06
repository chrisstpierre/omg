import * as _ from 'underscore';
import * as $ from 'shelljs';
import * as net from 'http';
import Microservice from './models/Microservice';
import EnvironmentVariable from './models/EnvironmentVariable';
const Docker = require('dockerode-promise');
export const docker = new Docker();

/**
 * Used to set values in the constructors of the microservice classes.
 *
 * @param {*} val The value to set
 * @param {*} _else The value to set if val if not defined
 * @return {*} The value
 */
export function setVal(val: any, _else: any): any {
  if (_.isUndefined(val)) {
    return _else;
  }
  return val;
}

/**
 * Get's the ports that need to be open defined by the given {@link Microservice}.
 *
 * @param {Microservice} microservice The given {@link Microservice}
 * @return {Array<Integer>} The ports that need to be opened for the given {@link Microservice}
 */
export function getNeededPorts(microservice: Microservice): number[] {
  const ports = [];
  for (let i = 0; i < microservice.actions.length; i += 1) {
    const action = microservice.actions[i];
    if (action.http !== null) {
      if (!ports.includes(action.http.port)) {
        ports.push(action.http.port);
      }
    }
    if (action.events !== null) {
      for (let j = 0; j < action.events.length; j += 1) {
        if (!ports.includes(action.events[j].subscribe.port)) {
          ports.push(action.events[j].subscribe.port);
        }
        if (action.events[j].unsubscribe && !ports.includes(action.events[j].unsubscribe.port)) {
          ports.push(action.events[j].unsubscribe.port);
        }
      }
    }
  }
  return ports;
}

/**
 * Creates a name for the Docker images based of the git remote -v.
 *
 * @return {Promise<String>} The image name
 */
export async function createImageName(): Promise<string> {
  try {
    const data = await exec('git remote -v');
    return `omg/${data.match(/git@github\.com:(\w+\/[\w|-]+).git/)[1].toLowerCase()}`;
  } catch (e) {
    return `omg/${Buffer.from(process.cwd()).toString('base64').toLowerCase().replace(/=/g, '')}`;
  }
}

/**
 * Turns a list of string with a delimiter to a map.
 *
 * @param {Array<String>} list The given list of strings with delimiter
 * @param {String} errorMessage The given message to used when unable to parse
 * @return {Object} Key value of the list
 */
export function parse(list: string[], errorMessage: string): any {
  const dictionary = {};
  for (let i = 0; i < list.length; i += 1) {
    const split = list[i].split(/=(.+)/);
    if (split.length !== 3) {
      throw {
        message: errorMessage,
      };
    }
    dictionary[split[0]] = split[1];
  }
  return dictionary;
}

/**
 * Matches the case of given cli environment arguments to the case defined in
 * the microservice.yml.
 *
 * @param {Object} env The given environment variable mapping
 * @param {Array<EnvironmentVariable>} environmentVariables The given {@link EnvironmentVariable}s
 * @return {Object} The environment mapping with correct cases
 */
export function matchEnvironmentCases(env: any, environmentVariables: EnvironmentVariable[]): any {
  const result = {};
  for (const key of Object.keys(env)) {
    for (const cap of environmentVariables) {
      if (cap.name.toLowerCase() === key.toLowerCase()) {
        result[cap.name] = env[key];
      }
    }
  }
  return result;
}

/**
 * Promise wrapper for the `exec`.
 *
 * @param {String} command The command to run
 * @param {Boolean} [silent=true] True if silent, otherwise false
 * @return {Promise<String>} The stdout if resolved, otherwise stderror unless stderror is empty
 */
export function exec(command: string, silent: boolean=true): Promise<string> {
  return new Promise(function(resolve, reject) {
    $.exec(command, {silent}, function(code, stdout, stderr) {
      if (code !== 0) {
        if (stderr === '') {
          reject(stdout.trim());
        } else {
          reject(stderr.trim());
        }
      } else {
        if (stdout === '') {
          resolve(stderr.trim());
        } else {
          resolve(stdout.trim());
        }
      }
    });
  });
}

/**
 * Checks if a docker container exists with the given name.
 *
 * @param {String} name The given name
 * @param {Array<Object>} containers The given containers
 * @return {Boolean} True if it exists, otherwise, false
 */
export function doesContainerExist(name: string, containers: any[]): boolean {
  for (let i = 0; i < containers.length; i += 1) {
    for (let j = 0; j < containers[i].RepoTags.length; j += 1) {
      if (containers[i].RepoTags[j].includes(name)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Log a string to stdout.
 *
 * @param {String} string The given sting to log
 */
export function log(string) {
  process.stdout.write(`${string}\n`);
}

/**
 * Log a string to stderr.
 *
 * @param {String} string The given string to log
 */
export function error(string) {
  process.stderr.write(`${string}\n`);
}

export const typeCast = {
  int: (int: string): number => parseInt(int),
  float: (float: string): number => parseFloat(float),
  string: (string: string): string => string,
  uuid: (uuid: string): string => uuid,
  list: (list: any): any[] => JSON.parse(list),
  map: (map: string): any => JSON.parse(map),
  object: (object: string): any => JSON.parse(object),
  boolean: (boolean: string): boolean => boolean === 'true',
  path: (path: string): string => path,
  any: (any: any): any => any,
};

export const dataTypes = {
  int: (int: string): boolean => {
    return int.match(/^[-+]?\d+$/) !== null;
  },
  float: (float: string): boolean => {
    return !isNaN(parseFloat(float)) && parseFloat(float).toString().indexOf('.') !== -1;
  },
  string: (string: string): boolean => {
    return true;
  },
  uuid: (uuid: string): boolean => {
    return uuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) !== null;
  },
  list: (list: string): boolean => {
    try {
      return (
        (Array.isArray(list) && typeof list === 'object')
        || JSON.parse(list).toString() !== '[object Object]'
      );
    } catch (e) {
      return false;
    }
  },
  map: (map: string): boolean => {
    try {
      return (
        (!Array.isArray(map) && typeof map === 'object')
        || JSON.parse(map).toString() === '[object Object]'
      );
    } catch (e) {
      return false;
    }
  },
  object: (object: string): boolean => {
    try {
      return ( // still need to check properties
        (!Array.isArray(object) && typeof object === 'object')
        || JSON.parse(object).toString() === '[object Object]'
      );
    } catch (e) {
      return false;
    }
  },
  boolean: (boolean: string): boolean => {
    return boolean === 'false' || boolean === 'true';
  },
  path: (path: string): boolean => {
    try {
      JSON.parse(path);
      return false;
    } catch (e) {
      const lastChar = path.substr(path.length - 1);
      if (lastChar === '/') {
        return false;
      }
      return typeof path === 'string';
    }
  },
  any: (any: string): boolean => {
    return true;
  },
};

/**
 * Get's an open port.
 *
 * @return {Promise<Number>} The open port
 */
export function getOpenPort(): Promise<number> {
  return new Promise((resolve) => {
    getPort((data) => {
      resolve(data);
    });
  });

  /**
   * Helper for {@link getOpenPort}. Tries to open a server on a random port, if fail try again, otherwise call
   * the callback with the port.
   *
   * @param {Function} cb The given callback
   */
  function getPort(cb: Function): void {
    const server = net.createServer();
    const port = Math.floor(Math.random() * 15000) + 2000; // port range 2000 to 17000
    server.listen(port, () => {
      server.once('close', () => {
        cb(port);
      });
      server.close();
    });
    server.on('error', () => {
      getPort(cb);
    });
  }
}

/**
 * Used to append the environment variable options into [args...].
 *
 * @param {Array} xs
 * @return {function(*=): (*|Array)}
 */
export function appender(xs: any[]): Function {
  xs = xs || [];
  return function(x) {
    xs.push(x);
    return xs;
  };
}

/**
 * Checks if any action in he given microserviceJson does not have
 * and interface (http, format, rpc, xor events).
 *
 * @param {Object} microserviceJson The given microservice json
 * @throws {Object} Throws error if more, or less than one interface
 *                  is given for an action
 */
export function checkActionInterface(microserviceJson: any): void {
  if (microserviceJson.actions) {
    const actionMap = microserviceJson.actions;
    for (const actionName of Object.keys(actionMap)) {
      const action = actionMap[actionName];
      const bools = [!!action.http, !!action.format, !!action.rpc, !!action.events].filter((b) => b);
      if (bools.length !== 1) {
        throw {
          text: `actions.${actionName} should have one of required property: 'http' 'format' 'rpc' or 'events'`,
        };
      }
    }
  }
}
