'use strict';

module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event));
  console.log("service-c is a go");

  callback(null, "foo");
};