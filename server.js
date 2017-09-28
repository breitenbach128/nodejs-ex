//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    mongojs = require('mongojs'),
    passport = require('passport'),
    util = require('util'),
    app     = express(),
    morgan  = require('morgan');
    
Object.assign=require('object-assign')

var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
//Directories
var publicDirectory = "public_html";
//Server variables for gameplay
var players = [];
var games = []; //rooms
var online = [];
var connection_string = '127.0.0.1:27017/GAME';
var gamesizelimit = 10;

//Disconnection Variables
var dcCacheRetentionTime = 5;//5 Minutes to retain dc'd players.
var dcCache = new Array();//Disconnected players for reconnection tracking
var cleanerArray = new Array();
//Classes
function playersyncdata (remoteid, gid) {
    this.pid=remoteid; 
    this.gid=gid;
    this.pos= {x: 100, y:100 };
    this.linearVel= 0;
    this.remoteAnim= 0;
    this.remoteId= 0;
    this.angle= 0;
    this.wpangles= "";
    this.health= {current: 100, max:100};
}
function botsyncdata (remoteid) {
    this.pid=remoteid; 
    this.pos= {x: 100, y:100 };
    this.linearVel= 0;
    this.remoteAnim= 0;
    this.remoteId= 0;
    this.angle= 0;
    this.wpangles= "";
    this.health= {current: 100, max:100};
}
//DisConnect cache timer
dcCacheTimer = setInterval(function () {
    
    //Clear out the cache after 5 minutes old.
    cleanerArray = [];
    var currentTime = Date.now();
    var expirationTime = 0;
    //Find old items
    for (var d = 0; d < dcCache.length; d++) {
        //console.log("dcCache:cached", dcCache[d].playerData.id);
        expirationTime = dcCache[d].timeStamp + (dcCacheRetentionTime * 60000);
        if (expirationTime < currentTime) {
            console.log("Player Expired On schedule:", dcCache[d].playerData.id);
            //Update player information and increase their disconnect count.
            hp_users_col.update(
            { 
                pid: dcCache[d].playerData.gid 
            },
            {
                $inc:
                    {
                        disconnects: 1
                    }
            },function(err){if(err){console.log("Update failed for player disconnect count ",data.pgid,err)}});
            //Add to removal list
            cleanerArray.push(d);
        }
    }
    //splice old items out of the dcCache
    for (var c = 0; c < cleanerArray.length; c++) {
        dcCache.splice(cleanerArray[c], 1);
    }
    //The histoical stats are reloaded onto the new player from the dcCache stats (kills, assist, damage, etc)


}, 1000*5);

//Google IDs
var GOOGLE_CLIENT_ID = "574759193783-00ci4dnduaunuqtj7vvp537tatecjifu.apps.googleusercontent.com";
var GOOGLE_CLIENT_SECRET = "VSqk-4Ta3EF0XcFdfkkb3KCI";

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Google profile is serialized
//   and deserialized.

passport.serializeUser(function(user, done) {
   //console.log('serializing user.',user.id);
    done(null, user.id);
});

passport.deserializeUser(function(obj, done) {
    //console.log('deserialize User',obj);
    done(null, obj);
});

//Morgan, HTML and EJS rendering and config
app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD']
      mongoUser = process.env[mongoServiceName + '_USER'];
      //hardcode the dbname to game2
      mongoDatabase = "game2";

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};
//Init DB
  if (!db) {
    initDb(function(err){});
  }else{
    var hp_users_col = db.collection('hp_users');
    var hp_matches_col = db.collection('hp_matches');
  }

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('hp_users');
    // Create a document with request IP and current time of request
    //col.insert({ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
