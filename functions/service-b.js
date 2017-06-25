'use strict';

module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event));
  console.log("service-b is going to call service-c");

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'boo'      
    }),
  };

  callback(null, response);
};