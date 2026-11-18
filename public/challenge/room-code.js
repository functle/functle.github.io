// Twelve-digit hex codes still identify rooms created before short codes shipped.
export const roomCodePattern = '(?:[a-z0-9]{4}|[a-f0-9]{12})';
export const validRoomCode = new RegExp('^' + roomCodePattern + '$', 'i');
export const roomPath = new RegExp('^/challenge/(' + roomCodePattern + ')/?$', 'i');
