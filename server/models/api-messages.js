var ApiMessages = function(){};
ApiMessages.EMAIL_NOT_FOUND = 0;
ApiMessages.INVALID_PWD = 1;
ApiMessages.DB_ERROR = 2;
ApiMessages.NOT_FOUND = 3;
ApiMessages.EMAIL_ALREADY_EXISTS = 4;
ApiMessages.COULD_NOT_CREATE_USER = 5;
ApiMessages.PASSWORD_RESET_EXPIRED = 6;
ApiMessages.PASSWORD_RESET_HASH_MISMATCH = 7;
ApiMessages.PASSWORD_RESET_EMAIL_MISMATCH = 8;
ApiMessages.COULD_NOT_RESET_PASSWORD = 9;
ApiMessages.USER_REGISTER_OK = 10;
ApiMessages.USER_REGISTER_FAILE = 11;

ApiMessages.prototype.getErrorAlert = function(error){
	switch(error){		
		case ApiMessages.EMAIL_NOT_FOUND:
			return ("this email address is not found");
			break;
		case ApiMessages.INVALID_PWD:
			return ("password is invalid");
			break;
		case ApiMessages.DB_ERROR:
			return ("database error");
			break;
		case ApiMessages.NOT_FOUND:
			return ("not found");
			break;
		case ApiMessages.EMAIL_ALREADY_EXISTS:					
			return ("this email is exists");
			break;
		case ApiMessages.COULD_NOT_CREATE_USER:
			return ("could not create user");
			break;
		case ApiMessages.PASSWORD_RESET_EXPIRED:
			return ("password reset expried");
			break;
		case ApiMessages.PASSWORD_RESET_EMAIL_MISMATCH:
			return ("password reset email mismatch");
			break;
		case ApiMessages.COULD_NOT_RESET_PASSWORD:
			return ("could not reset password");
			break;
		case ApiMessages.USER_REGISTER_FAILE:
			return ("user register false");
			break;
		case ApiMessages.USER_REGISTER_OK:
			return ("user register ok");
			break;

		default:
      		return ("");
	}
};

module.exports = ApiMessages;