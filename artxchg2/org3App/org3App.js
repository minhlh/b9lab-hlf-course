'use strict'; // self-defence

// Functions from figure
const hfc = require('fabric-client');
let channel;

const enrolUser = function(client, options) {
  return hfc.newDefaultKeyValueStore({ path: options.wallet_path })
    .then(wallet => {
      client.setStateStore(wallet);
      return client.getUserContext(options.user_id, true);
    });
};

const initNetwork = function(client, options, target) {
  let channel;
  try {
    channel = client.newChannel(options.channel_id);
    const peer = client.newPeer(options.peer_url);
    target.push(peer);
    channel.addPeer(peer);
    channel.addOrderer(client.newOrderer(options.orderer_url));
  } catch(e) { // channel already exists
    channel = client.getChannel(options.channel_id);
  }
  return channel;
};

const transactionProposal = function(client, channel, request) {
  request.txId = client.newTransactionID();
  return channel.sendTransactionProposal(request);
};

const responseInspect = function(results) {
  const proposalResponses = results[0];
  const proposal = results[1];
  const header = results[2];

  if (proposalResponses && proposalResponses.length > 0 &&
    proposalResponses[0].response &&
    proposalResponses[0].response.status === 200) {
    return true;
  }
  return false;
};

const sendOrderer = function(channel, request) {
  return channel.sendTransaction(request);
};

const target = [];

// Function invokes createPC on pcxchg
function invokeCh(opt, param) {
  const client = new hfc();
  return enrolUser(client, opt)
    .then(user => {
      if(typeof user === "undefined" || !user.isEnrolled())
        throw "User not enrolled";

      channel = initNetwork(client, opt, target);
      const request = {
          targets: target,
          chaincodeId: opt.chaincode_id,
          fcn: 'createArt',
          args: param,
          chainId: opt.channel_id,
          txId: null
      };
      return transactionProposal(client, channel, request);
    })
    .then(results => {
      if (responseInspect(results)) {
        const request = {
          proposalResponses: results[0],
          proposal: results[1],
          header: results[2]
        };
        return sendOrderer(channel, request);
      } else {
        throw "Response is bad";
      }
    })
    .catch(err => {
      console.log(err);
      throw err;
    });
};

// Function joins the channel
function joinCh(opt, param) {
  const client = new hfc();
  return enrolUser(client, opt)
    .then(user => {
      if(typeof user === "undefined" || !user.isEnrolled())
        throw "User not enrolled";

      channel = initNetwork(client, opt, target);

      let tx_id = client.newTransactionID();
      let g_request = {
        txId :     tx_id
      };

      // get the genesis block from the orderer
      channel.getGenesisBlock(g_request).then((block) => {
        let genesis_block = block;
        let tx_id = client.newTransactionID();

        let j_request = {
          targets : target,
          block : genesis_block,
          txId :     tx_id
        };

        // send genesis block to the peer
        return channel.joinChannel(j_request);  

      }).then((results) => {

        // throw "Response is " + JSON.stringify(results);

        if(results[0] && results[0].response.status == 200) {
          throw "Response is GOOD";

        } else {
          throw "Response is BAD";

        }
      });
    })
    .catch(err => {

      console.log(err);
      throw err;
    });
};

// Options
const options = {
  Org3 : {
    wallet_path: '/home/adam/hlf/adam-h-code/artxchg2/org3App/certs/',
    user_id: 'Org3Admin',
    channel_id: 'org2',
    chaincode_id: 'artxchg2',
    peer_url: 'grpc://localhost:17051',
    orderer_url: 'grpc://localhost:7050'
  }
};


// Server
const express = require("express");
const app = express();
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');

app.engine('html', require('ejs').renderFile);

const server = http.createServer(app).listen(4000, function() {});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.set('views', __dirname);

app.post('/invoke', function(req, res, next) {
  const args = req.body.args;
  invokeCh(options[args[0]], args.slice(1))
    .then(() => res.send("Chaincode invoked"))
    .catch(err => {
      res.status(500);
      res.send(err.toString());
    });
});

app.post('/join', function(req, res, next) {
  const args = req.body.args;
  joinCh(options[args[0]], args.slice(1))
    .then(() => res.send("Channel Joined"))
    .catch(err => {
      res.status(500);
      res.send(err.toString());
    });
});

app.get('/', function(req, res) {
  res.render('UI.html');
});
