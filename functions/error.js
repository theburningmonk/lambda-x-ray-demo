'use strict';

module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event));
  console.log("this is going to error...");

  throw new Error("boom");
};