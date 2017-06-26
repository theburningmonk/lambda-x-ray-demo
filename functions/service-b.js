'use strict';

module.exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event));  

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'boo'      
    }),
  };

  callback(null, response);
};