const mongoose = require("mongoose");
const redis = require("redis");
const util = require("util");

const redisUrl = "redis://127.0.0.1:6379";
const client = redis.createClient(redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options = {}) {
  //this == query instance
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || "");

  // makes this function chainable
  return this;
};

//overiding the above function
mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name,
    })
  );
  //see if we have a value for key in redis
  const cacheValue = await client.hget(this.hashKey, key);

  //if we do return that
  if (cacheValue) {
    const doc = JSON.parse(cacheValue);
    return Array.isArray(doc)
      ? doc.map((d) => new this.model(d))
      : new this.model(doc);
  }

  //otherwise, issue the query and store the result
  const result = await exec.apply(this, arguments);
  console.log(result);

  client.hset(this.hashKey, key, JSON.stringify(result), "EX", 10);

  //return exec.apply(this, arguments);
  return result;
};

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  },
};
