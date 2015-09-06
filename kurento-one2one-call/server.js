/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */
var path = require('path');
var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var express = require('express'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    mongoose = require('mongoose'),
    expressSession = require('express-session'),
    mongooseSession = require('mongoose-session'); // https://github.com/chncdcksn/mongoose-session
//usersRoutes = require('./routes/users');
var AccountRoute = require('./server/controllers/accountRouteController');
var apiMessages = require('./server/models/api-messages');
var ApiResponse = require('./server/models/api-response');
var cookieParser = require('cookie-parser');
var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: "http://localhost:8080/",
        ws_uri: "ws://localhost:8888/kurento"
    }
});
var app = express();
var dbName = 'testWebrtcDB';
var connectionString = 'mongodb://localhost:27017/' + dbName;
mongoose.connect(connectionString);
app.use(expressSession({
    key: 'session',
    secret: '128013A7-5B9F-4CC0-BD9E-4480B2D3EFE9',
    store: new mongooseSession(mongoose),
    resave: true,
    saveUninitialized: true
}));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
/*
 * Definition of global variables.
 */
var kurentoClient = null;
var userRegistry = new UserRegistry();
var userSignin = new UserSignin();
var pipelines = {};
var candidatesQueue = {};
var idCounter = 0;

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}
/*
 * Definition of helper classes
 */
// Represents caller and callee sessions
function UserSession(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.peer = null;
    this.sdpOffer = null;
}
UserSession.prototype.sendMessage = function(message) {
    this.ws.send(JSON.stringify(message));
}

function UserSessionRoom(id, name, ws, room) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.sdpOffer = null;
    this.webRTCEndpoint = null;
    this.room = room;
}
UserSessionRoom.prototype.sendMessage = function(message) {
        this.ws.send(JSON.stringify(message));
    }
    // Represents registrar of users
function UserRegistry() {
    this.usersById = {};
    this.usersByName = {};
}
UserRegistry.prototype.register = function(user) {
    this.usersById[user.id] = user;
    this.usersByName[user.name] = user;
}
UserRegistry.prototype.unregister = function(id) {
    var user = this.getById(id);
    if (user) delete this.usersById[id]
    if (user && this.getByName(user.name)) delete this.usersByName[user.name];
}
UserRegistry.prototype.getById = function(id) {
    return this.usersById[id];
}
UserRegistry.prototype.getByName = function(name) {
    return this.usersByName[name];
}
UserRegistry.prototype.removeById = function(id) {
    var userSession = this.usersById[id];
    if (!userSession) return;
    delete this.usersById[id];
    delete this.usersByName[userSession.name];
}

function UserSignin() {
    this.usersById = {};
    this.usersByEmail = {};
}
UserSignin.prototype.signin = function(user) {
    this.usersById[user.id] = user;
    this.usersByEmail[user.name] = user;
}
UserSignin.prototype.getById = function(id) {
    return this.usersById[id];
}
UserSignin.prototype.getByEmail = function(name) {
    return this.usersByEmail[name];
}
UserSignin.prototype.removeById = function(id) {
    var userSession = this.usersById[id];
    if (!userSession) return;
    delete this.usersById[id];
    delete this.usersByEmail[userSession.name];
}
UserSignin.prototype.logOut = function(id) {
        var user = this.getById(id);
        if (user) delete this.usersById[id]
        if (user && this.getByEmail(user.name)) delete this.usersByEmail[user.name];
}

UserSignin.prototype.getUsersByRoom = function (room) {
    var userList = this.usersByEmail;
    var usersInRoomList = [];
    for(var i in userList) {
        if (userList[i].room === room) {
            usersInRoomList.push(userList[i]);
            console.log("user by room for loop: " + usersInRoomList);
        }
    }

    return usersInRoomList;
}

// Represents a B2B active call
function CallMediaPipeline() {
    this.pipeline = null;
    this.webRtcEndpoint = {};
}
CallMediaPipeline.prototype.createPipeline = function(callerId, calleeId, ws, callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            return callback(error);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                return callback(error);
            }
            pipeline.create('WebRtcEndpoint', function(error, callerWebRtcEndpoint) {
                if (error) {
                    pipeline.release();
                    return callback(error);
                }
                if (candidatesQueue[callerId]) {
                    while (candidatesQueue[callerId].length) {
                        var candidate = candidatesQueue[callerId].shift();
                        callerWebRtcEndpoint.addIceCandidate(candidate);
                    }
                }
                callerWebRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    userSignin.getById(callerId).ws.send(JSON.stringify({
                        id: 'iceCandidate',
                        candidate: candidate
                    }));
                });
                pipeline.create('WebRtcEndpoint', function(error, calleeWebRtcEndpoint) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }
                    if (candidatesQueue[calleeId]) {
                        while (candidatesQueue[calleeId].length) {
                            var candidate = candidatesQueue[calleeId].shift();
                            calleeWebRtcEndpoint.addIceCandidate(candidate);
                        }
                    }
                    calleeWebRtcEndpoint.on('OnIceCandidate', function(event) {
                        var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                        userSignin.getById(calleeId).ws.send(JSON.stringify({
                            id: 'iceCandidate',
                            candidate: candidate
                        }));
                    });
                    callerWebRtcEndpoint.connect(calleeWebRtcEndpoint, function(error) {
                        if (error) {
                            pipeline.release();
                            return callback(error);
                        }
                        calleeWebRtcEndpoint.connect(callerWebRtcEndpoint, function(error) {
                            if (error) {
                                pipeline.release();
                                return callback(error);
                            }
                        });
                        self.pipeline = pipeline;
                        self.webRtcEndpoint[callerId] = callerWebRtcEndpoint;
                        self.webRtcEndpoint[calleeId] = calleeWebRtcEndpoint;
                        callback(null);
                    });
                });
            });
        });
    })
}
CallMediaPipeline.prototype.generateSdpAnswer = function(id, sdpOffer, callback) {
    this.webRtcEndpoint[id].processOffer(sdpOffer, callback);
    this.webRtcEndpoint[id].gatherCandidates(function(error) {
        if (error) {
            return callback(error);
        }
    });
}
CallMediaPipeline.prototype.release = function() {
        if (this.pipeline) this.pipeline.release();
        this.pipeline = null;
    }
    /*
     * Server startup
     */
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = app.listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});
var wss = new ws.Server({
    server: server,
    path: '/one2one'
});
wss.on('connection', function(ws) {
    var sessionId = nextUniqueId();
    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });
    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
        userSignin.logOut(sessionId);
    });
    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        switch (message.id) {
            case 'register':
                register(sessionId, message.name, message.lastname, message.email, message.password, message.passwordconfirm, ws);
                break;
            case 'signin':
                signIn(sessionId, message.email, message.password, ws);
                break;
            case 'joinRoom':
                joinRoom(sessionId, message.name, ws, message.room);
                break;
            case 'receiveVideoFrom':
                receiveVideoFrom(userSessionRoom, message.sender, message.sdpOffer, function (error, sdpAnswer) {
                    if (error) {
                        console.log(error);
                    }
                    data = {
                        id: 'receiveVideoAnswer',
                        name: message.sender,
                        sdpAnswer: sdpAnswer
                    };
                    return ws.send(JSON.stringify(data));
                });

                break;

            case 'call':
                call(sessionId, message.to, message.from, message.sdpOffer);
                break;
            case 'incomingCallResponse':
                incomingCallResponse(sessionId, message.from, message.callResponse, message.sdpOffer, ws);
                break;
            case 'stop':
                stop(sessionId);
                break;
            case 'onIceCandidate':
                onIceCandidate(sessionId, message.candidate);
                break;
            default:
                ws.send(JSON.stringify({
                    id: 'error',
                    message: 'Invalid message ' + message
                }));
                break;
        }
    });
});

function receiveVideoFrom(currentUser, senderName, sdp, callback)
{
    var sender = userSignin.getByEmail(senderName);
    if (pipeline === null) {
        getKurentoClient(function (error, kurentoClient) {
            kurentoClient.create('MediaPipeline', function (error, _pipeline) {
                if (error) {
                    return callback(error);
                }
                pipeline = _pipeline;
                pipeline.create('WebRtcEndpoint', function (error, webRtcEndpoint) {

                    if (error) {
                        console.log(error);
                    }
                    currentUser.webRTCEndpoint = webRtcEndpoint;
                    userSignin.usersById[currentUser.id] = currentUser;
                    userSignin.usersByEmail[currentUser.name] = currentUser;
                    incomingMedia[currentUser.name] = webRtcEndpoint;
                    console.log("Created Pipeline & rtcEndpoint");
                    webRtcEndpoint.processOffer(sdp, function (error, sdpAnswer) {
                        callback(null, sdpAnswer);
                    });
                });
            }
            )
        });
    } else {
        console.log("Sender name::" + sender.name);
        senderName = sender.name;
        if (incomingMedia[senderName]) {

            pipeline.create('WebRtcEndpoint', function (err, webRtcEndpoint) {

                webRtcEndpoint.processOffer(sdp, function (err, sdpAnswer) {
                    incomingMedia[senderName].connect(webRtcEndpoint, function () {
                        callback(null, sdpAnswer);
                    });


                });
            });

        } else {
            pipeline.create('WebRtcEndpoint', function (error, webRtcEndpoint) {
                if (error) {
                    console.log(error);
                }
                incomingMedia[sender.name] = webRtcEndpoint;
                sender.webRTCEndpoint = webRtcEndpoint;
                userSignin.usersById[sender.id] = sender;
                userSignin.usersByEmail[sender.name] = sender;
                webRtcEndpoint.processOffer(sdp, function (err, sdpAnswer) {
                    if (err) {
                        console.log(err);
                    }
                    callback(null, sdpAnswer);
                });
                notifyOthers(currentUser.name);
            });

        }
    }
}

function notifyOthers(newParticipant)
{
    var myRoom = userSessionRoom.room;
    
    if (userSignin) {
        var peers = userSignin.getUsersByRoom(myRoom);
        for (var i in peers) {
            peer = peers[i];
            console.log(peer.name);
            if (peer.name !== newParticipant && peer.ws!==undefined) {
                console.log("Notifying " + peer.name +"===SOCKET::"+ peer.ws);
                peer.ws.send(JSON.stringify({
                    id: 'newParticipantArrived',
                    name: newParticipant
                }));
            }
        }
    }
}

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }
    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function stop(sessionId) {
    if (!pipelines[sessionId]) {
        return;
    }
    var pipeline = pipelines[sessionId];
    delete pipelines[sessionId];
    pipeline.release();
    var stopperUser = userSignin.getById(sessionId);
    var stoppedUser = userSignin.getByEmail(stopperUser.peer);
    stopperUser.peer = null;
    if (stoppedUser) {
        stoppedUser.peer = null;
        delete pipelines[stoppedUser.id];
        var message = {
            id: 'stopCommunication',
            message: 'remote user hanged out'
        }
        stoppedUser.sendMessage(message)
    }
    clearCandidatesQueue(sessionId);
}

function joinRoom(sessionId, name, ws, room) {
    registerRoom(sessionId, name, ws, room);
}

var userSessionRoom = null;
function registerRoom(id, name, ws, room, callback) {
    function onError(error) {
        console.log("Error processing register: " + error);
        ws.send(JSON.stringify({
            id: 'registerRoomResponse',
            response: 'rejected ',
            message: error
        }));
    }
    if (!name) {
        return onError("empty user name");
    }
    // if (userSignin.getByEmail(name)) {
    //     return onError("already registered");
    // }
    console.log("user session room: " + id + "\t" + name + "\t" + room);
    userSignin.signin(new UserSessionRoom(id, name, ws, room));
    try {
        //      ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted'}));
        var participants = [];
        // if (userSignin) {
            participantsName = userSignin.getUsersByRoom(room);
            console.log("participant name: " + participantsName);
            for (var i in participantsName) {
                if (name === participantsName[i].name || participantsName[i].name == "") {
                    continue;
                }
                participants.push(participantsName[i].name);
                console.log(participants);
            }
        // }
        ws.send(JSON.stringify({
            id: "existingParticipants",
            data: participants
        }));
    } catch (exception) {
        onError(exception);
    }
}

function incomingCallResponse(calleeId, from, callResponse, calleeSdp, ws) {
    clearCandidatesQueue(calleeId);

    function onError(callerReason, calleeReason) {
        if (pipeline) pipeline.release();
        if (caller) {
            var callerMessage = {
                id: 'callResponse',
                response: 'rejected'
            }
            if (callerReason) callerMessage.message = callerReason;
            caller.sendMessage(callerMessage);
        }
        var calleeMessage = {
            id: 'stopCommunication'
        };
        if (calleeReason) calleeMessage.message = calleeReason;
        callee.sendMessage(calleeMessage);
    }
    var callee = userSignin.getById(calleeId);
    if (!from || !userSignin.getByEmail(from)) {
        return onError(null, 'unknown from = ' + from);
    }
    var caller = userSignin.getByEmail(from);
    if (callResponse === 'accept') {
        var pipeline = new CallMediaPipeline();
        pipelines[caller.id] = pipeline;
        pipelines[callee.id] = pipeline;
        pipeline.createPipeline(caller.id, callee.id, ws, function(error) {
            if (error) {
                return onError(error, error);
            }
            pipeline.generateSdpAnswer(caller.id, caller.sdpOffer, function(error, callerSdpAnswer) {
                if (error) {
                    return onError(error, error);
                }
                pipeline.generateSdpAnswer(callee.id, calleeSdp, function(error, calleeSdpAnswer) {
                    if (error) {
                        return onError(error, error);
                    }
                    var message = {
                        id: 'startCommunication',
                        sdpAnswer: calleeSdpAnswer
                    };
                    callee.sendMessage(message);
                    message = {
                        id: 'callResponse',
                        response: 'accepted',
                        sdpAnswer: callerSdpAnswer
                    };
                    caller.sendMessage(message);
                });
            });
        });
    } else {
        var decline = {
            id: 'callResponse',
            response: 'rejected',
            message: 'user declined'
        };
        caller.sendMessage(decline);
    }
}

function call(callerId, to, from, sdpOffer) {
    clearCandidatesQueue(callerId);
    var caller = userSignin.getById(callerId);
    var accountRoute = new AccountRoute();
    var apiMessageAlert = new apiMessages();
    accountRoute.readUserByEmail(to, function(readUserCallResponse) {
        console.log("call " + readUserCallResponse.success);
        if (readUserCallResponse.success) {
            var rejectCause = 'User ' + to + ' is not registered';
            if (userSignin.getByEmail(to)) {
                var callee = userSignin.getByEmail(to);
                console.log("callee " + callee);
                caller.sdpOffer = sdpOffer
                callee.peer = from;
                caller.peer = to;
                var message = {
                    id: 'incomingCall',
                    from: from
                };
                try {
                    return callee.sendMessage(message);
                } catch (exception) {
                    rejectCause = "Error " + exception;
                }
            } else {
                return caller.sendMessage({
                    id: 'callResponse',
                    response: 'rejected: ',
                    message: 'nguoi duoc goi khong online'
                });
            }
        }
        var message = {
            id: 'callResponse',
            response: 'rejected: ',
            message: apiMessageAlert.getErrorAlert(readUserCallResponse.extras.msg)
        };
        caller.sendMessage(message);
    });
}

function signIn(id, emailAddress, password, ws) {
    function onError(error) {
        ws.send(JSON.stringify({
            id: 'signinResponse',
            response: 'rejected ',
            message: error
        }));
    }
    if (!emailAddress) {
        return onError("empty email address");
    }
    userSignin.signin(new UserSession(id, emailAddress, ws));
    var userInfoInput = {
        email: emailAddress,
        pwd: password
    };
    var accountRoute = new AccountRoute();
    accountRoute.signinUser(id, userInfoInput, function(responseAccountSignIn) {
        if (responseAccountSignIn.success) {
            try {
                ws.send(JSON.stringify({
                    id: 'signinResponse',
                    response: 'accepted'
                }));
            } catch (exception) {
                onError(exception);
            }
        } else {
            var apiMessageAlert = new apiMessages();
            onError(apiMessageAlert.getErrorAlert(responseAccountSignIn.extras.msg));
        }
    });
}

function register(id, name, lastName, emailAddress, password, passwordConfirm, ws, callback) {
    function onError(error) {
        console.log("Error register " + error);
        ws.send(JSON.stringify({
            id: 'registerResponse',
            response: 'rejected ',
            message: error
        }));
    }
    if (!name) {
        return onError("empty user name");
    }
    if (userRegistry.getByName(name)) {
        return onErronErroror("User " + name + " is already registered");
    }
    userRegistry.register(new UserSession(id, name, ws));
    var userInfo = {
        firstName: name,
        lastName: lastName,
        email: emailAddress,
        pwd: password,
        pwdConfirm: passwordConfirm
    };
    var accountRoute = new AccountRoute();
    accountRoute.registerUser(id, userInfo, function(responseAccountRoute) {
        if (responseAccountRoute.success) {
            try {
                ws.send(JSON.stringify({
                    id: 'registerResponse',
                    response: 'accepted'
                }));
            } catch (exception) {
                onError(exception);
            }
        } else {
            var apiMessageAlert = new apiMessages();
            onError(apiMessageAlert.getErrorAlert(responseAccountRoute.extras.msg));
        }
    });
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);
    var user = userSignin.getById(sessionId);
    if (pipelines[user.id] && pipelines[user.id].webRtcEndpoint && pipelines[user.id].webRtcEndpoint[user.id]) {
        var webRtcEndpoint = pipelines[user.id].webRtcEndpoint[user.id];
        webRtcEndpoint.addIceCandidate(candidate);
    } else {
        if (!candidatesQueue[user.id]) {
            candidatesQueue[user.id] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}
app.use(express.static(path.join(__dirname, 'static')));