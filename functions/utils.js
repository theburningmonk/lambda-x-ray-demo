'use strict';

const AWSXRay = require('aws-xray-sdk');
console.log(AWSXRay);

const https   = AWSXRay.captureHTTPs(require('https'));

let request = (method, hostname, path) => {
  const options = { hostname, port: 443, path, method };

  let promise = new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      console.log('statusCode:', res.statusCode);
      console.log('headers:', res.headers);

      res.on('data', buffer => resolve(buffer.toString('utf8')));
    });

    req.on('error', err => reject(err));

    req.end();
  });

  return promise;  
}

module.exports = {
  request
};