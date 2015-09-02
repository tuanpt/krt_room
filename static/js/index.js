/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
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
var ws = new WebSocket('ws://' + location.host + '/one2one');
var videoInput;
var videoOutput;
var webRtcPeer;
var registerName = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
const IS_PASSWORD_MATCH = 3;
const IS_COMPLEX_PASSWORD = 4;
const IS_VALID_EMAIL = 5;
const NOT_SIGNIN = 6;
const SIGNINING = 7;
const SIGNINED = 8;
var registerState = null
var signinState = null

function setRegisterState(nextState) {
    switch (nextState) {
        case NOT_REGISTERED:
            $('#register').attr('disabled', false);
            $('#signIn').attr('disabled', false);
            $('#call').attr('disabled', true);
            $('#terminate').attr('disabled', true);
            break;
        case REGISTERING:
            $('#register').attr('disabled', true);
            $('#signIn').attr('disabled', true);
            break;
        case REGISTERED:
            $('#register').attr('disabled', true);
            $('#signIn').attr('disabled', true);
            setCallState(NO_CALL);
            break;
        default:
            return;
    }
    registerState = nextState;
}

function setSignInState(nextState) {
    switch (nextState) {
        case NOT_SIGNIN:
            $('#register').attr('disabled', false);
            $('#signIn').attr('disabled', false);
            $('#call').attr('disabled', true);
            $('#terminate').attr('disabled', true);
            break;
        case SIGNINING:
            $('#register').attr('disabled', true);
            $('#signIn').attr('disabled', true);
            break;
        case SIGNINED:
            $('#register').attr('disabled', true);
            $('#signIn').attr('disabled', true);
            setCallState(NO_CALL);
            break;
        default:
            return;
    }
    signinState = nextState;
}
const NO_CALL = 0;
const PROCESSING_CALL = 1;
const IN_CALL = 2;
var callState = null

function setCallState(nextState) {
    switch (nextState) {
        case NO_CALL:
            $('#call').attr('disabled', false);
            $('#terminate').attr('disabled', true);
            break;
        case PROCESSING_CALL:
            $('#call').attr('disabled', true);
            $('#terminate').attr('disabled', true);
            break;
        case IN_CALL:
            $('#call').attr('disabled', true);
            $('#terminate').attr('disabled', false);
            break;
        default:
            return;
    }
    callState = nextState;
}
window.onload = function() {
    console = new Console();
    setRegisterState(NOT_REGISTERED);
    var drag = new Draggabilly(document.getElementById('videoSmall'));
    videoInput = document.getElementById('videoInput');
    videoOutput = document.getElementById('videoOutput');
    // document.getElementById('txt-first-name').focus();
    document.getElementById('register').addEventListener('click', function() {
        register();
    });
    document.getElementById('call').addEventListener('click', function() {
        call();
    });
    document.getElementById('terminate').addEventListener('click', function() {
        stop();
    });
    document.getElementById('signIn').addEventListener('click', function(){
        signIn();
    });    
}
window.onbeforeunload = function() {
    ws.close();
}
ws.onmessage = function(message) {
    var parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);
    switch (parsedMessage.id) {
        case 'registerResponse':
            resgisterResponse(parsedMessage);
            break;
        case 'signinResponse':
            signInReponse(parsedMessage);
            break;
        case 'callResponse':
            callResponse(parsedMessage);
            break;
        case 'incomingCall':
            incomingCall(parsedMessage);
            break;
        case 'startCommunication':
            startCommunication(parsedMessage);
            break;
        case 'stopCommunication':
            console.info("Communication ended by remote peer");
            stop(true);
            break;
        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function resgisterResponse(message) {
    if (message.response == 'accepted') {
        setRegisterState(REGISTERED);
    } else {
        setRegisterState(NOT_REGISTERED);
        var errorMessage = message.message ? message.message : 'Unknown reason for register rejection.';
        console.log(errorMessage);
        alert('Error registering user: ' + errorMessage + '!!!');
    }
}

function signInReponse(message) {
    if (message.response == 'accepted') {
        setSignInState(SIGNINED);
    } else {
        setSignInState(NOT_SIGNIN);
        var errorMessage = message.message ? message.message : 'Unknown reason for sign in falsed.';
        console.log(errorMessage);
        alert('Error sign in user: ' + errorMessage + '!!!');
    }
}

function callResponse(message) {
    if (message.response != 'accepted') {
        console.info('Call not accepted by peer. Closing call');
        var errorMessage = message.message ? message.message : 'Unknown reason for call rejection.';
        window.alert(errorMessage);
        stop(true);
    } else {
        setCallState(IN_CALL);
        webRtcPeer.processAnswer(message.sdpAnswer);
    }
}

function startCommunication(message) {
    setCallState(IN_CALL);
    webRtcPeer.processAnswer(message.sdpAnswer);
}

function incomingCall(message) {
    // If bussy just reject without disturbing user
    if (callState != NO_CALL) {
        var response = {
            id: 'incomingCallResponse',
            from: message.from,
            callResponse: 'reject',
            message: 'bussy'
        };
        return sendMessage(response);
    }
    setCallState(PROCESSING_CALL);
    if (confirm('User ' + message.from + ' is calling you. Do you accept the call?')) {
        showSpinner(videoInput, videoOutput);
        var options = {
            localVideo: videoInput,
            remoteVideo: videoOutput,
            onicecandidate: onIceCandidate
        }
        webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error) {
            if (error) {
                console.error(error);
                setCallState(NO_CALL);
            }
            this.generateOffer(function(error, offerSdp) {
                if (error) {
                    console.error(error);
                    setCallState(NO_CALL);
                }
                var response = {
                    id: 'incomingCallResponse',
                    from: message.from,
                    callResponse: 'accept',
                    sdpOffer: offerSdp
                };
                sendMessage(response);
            });
        });
    } else {
        var response = {
            id: 'incomingCallResponse',
            from: message.from,
            callResponse: 'reject',
            message: 'user declined'
        };
        sendMessage(response);
        stop(true);
    }
}

function register() {
    var firstName = document.getElementById('txt-first-name').value;
    var lastName = document.getElementById('txt-last-name').value;
    var emailAddress = document.getElementById('txt-email-address').value;
    var password = document.getElementById('txt-password').value;
    var passwordConfirm = document.getElementById('txt-password-confirm').value;
    var passwordsMatch = function(password, passwordConfirm) {
        return password === passwordConfirm;
    };
    var passwordIsComplex = function(password) {
        // TODO: implement password complexity rules here.  There should be similar rule on the server side.
        return true;
    };
    var emailAddressIsValid = function(email) {
        var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    };
    if (firstName == '') {
        window.alert("You must insert your user name");
        return;
    }
    if (lastName == '') {
        window.alert("You must insert your last name");
        return;
    }
    if (emailAddress.length === 0) {
        window.alert("You must insert your email address");
        return;
    }
    if (password.length === 0) {
        window.alert("You must insert your password");
        return;
    }
    if (passwordConfirm.length === 0) {
        window.alert("You must insert your password confirm");
        return;
    }
    if (!passwordsMatch(password, passwordConfirm)) {
        window.alert("Your passwords don't match.");
        return;
    }
    if (!passwordIsComplex(password)) {
        window.alert("Your password is very easy to guess.  Please try a more complex password.");
        return;
    }
    if (!emailAddressIsValid(emailAddress)) {
        window.alert("<p>Please enter a valid email address.</p>");
        return;
    }
    setRegisterState(REGISTERING);
    var message = {
        id: 'register',
        name: firstName,
        lastname: lastName,
        email: emailAddress,
        password: password,
        passwordconfirm: passwordConfirm
    };
    sendMessage(message);
    document.getElementById('peer').focus();
}

function signIn() {
    console.log("start sign in");
    var emailAddress = document.getElementById('txt-email-address').value;
    var password = document.getElementById('txt-password').value;
    var emailAddressIsValid = function(email) {
        var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    };
    if (emailAddress.length === 0) {
        window.alert("You must insert your email address");
        return;
    }
    if (password.length === 0) {
        window.alert("You must insert your password");
        return;
    }
    var message = {
        id: 'signin',
        email: emailAddress,
        password: password,
    };
    sendMessage(message);
    document.getElementById('peer').focus();
}

function call() {
    if (document.getElementById('peer').value == '') {
        window.alert("You must specify the peer name");
        return;
    }
    setCallState(PROCESSING_CALL);
    showSpinner(videoInput, videoOutput);
    var options = {
        localVideo: videoInput,
        remoteVideo: videoOutput,
        onicecandidate: onIceCandidate
    }
    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error) {
        if (error) {
            console.error(error);
            setCallState(NO_CALL);
        }
        this.generateOffer(function(error, offerSdp) {
            if (error) {
                console.error(error);
                setCallState(NO_CALL);
            }
            var message = {
                id: 'call',
                from: document.getElementById('txt-email-address').value,
                to: document.getElementById('peer').value,
                sdpOffer: offerSdp
            };
            sendMessage(message);
        });
    });
}

function stop(message) {
    setCallState(NO_CALL);
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;
        if (!message) {
            var message = {
                id: 'stop'
            }
            sendMessage(message);
        }
    }
    hideSpinner(videoInput, videoOutput);
}

function sendMessage(message) {
    var jsonMessage = JSON.stringify(message);
    console.log('Senging message: ' + jsonMessage);
    ws.send(jsonMessage);
}

function onIceCandidate(candidate) {
    console.log('Local candidate' + JSON.stringify(candidate));
    var message = {
        id: 'onIceCandidate',
        candidate: candidate
    }
    sendMessage(message);
}

function showSpinner() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].poster = './img/transparent-1px.png';
        arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
}

function hideSpinner() {
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].src = '';
        arguments[i].poster = './img/webrtc.png';
        arguments[i].style.background = '';
    }
}
/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
    event.preventDefault();
    $(this).ekkoLightbox();
});