// An interesting discussion on the fs.promises interface:
// https://stackoverflow.com/questions/74516234/understanding-node-js-requirefs-vs-requirefs-promises
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
require('dotenv').config();

// Google is used to interact with the Google BDL
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// Axios is used to interact with the SJI BDL API
const axios = require('axios');

const querystring = require('querystring');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const NODE_SESSION_PATH = path.join(process.cwd(), 'nodesession.json');

if (!process.env.API_SERVER) {
  console.warn('process.env.API_SERVER is not set using default: localhost');
}
const API_SERVER = process.env.API_SERVER || 'localhost';

if (!process.env.API_USER) {
  console.warn('process.env.API_USER is not set using default: sji-bdl');
}
const API_USER = process.env.API_USER || 'sji-bdl';

if (!process.env.API_PASSWORD) {
  console.warn('process.env.API_PASSWORD is not set using default: sji-bdl');
}
const API_PASSWORD = process.env.API_PASSWORD || 'sji-bdl';

// This will not use https in development
var PREFIX = 'http://';
if ( process.env.NODE_ENV == 'production' ) {
  PREFIX = 'https://';
} else {
  console.warn('process.env.NODE_ENV not set using default: development');
}

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  console.debug('loadSavedCredentialsIfExist()');
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return new TypeError(err.message +', could not load saved credentials');;
  }
}

async function loadSavedNodeSessionIfExist() {
  console.debug('loadSavedNodeSessionIfExist() '+ NODE_SESSION_PATH);
  return fs.readFile(NODE_SESSION_PATH, 'ascii')
    .then(function(response) {
      try {
	return response;
      } catch(error) {
        console.error(error);
        throw new TypeError(error.message);
      }
      return JSON.parse(response);
    })
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(config) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function saveNodeSession(config) {
  console.debug('saveNodeSession() config: '+ config);
  return await fs.writeFile(NODE_SESSION_PATH, config);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  console.debug('authorize()');
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function authorizeNode() {
  console.debug('authorizeNode()');
  var SNS = await loadSavedNodeSessionIfExist()
    .then((response) => {
      if (response) {
        // because this is an async function this return is the same as
        // return Promise.resolve(client);
        // https://javascript.info/async-await
        return response;
      }
    })
    .catch((error) => {
      throw new TypeError(error.message);
    });

  // If we have a Saved Node Session then we should verify it is still valid
  // and return it
  if (SNS) {
    console.debug('authorizeNode(): '+ PREFIX + API_SERVER + '/users/me');
    return await axios.get(PREFIX + API_SERVER + '/users/me', JSON.parse(SNS))
    .then((json) => {
      console.debug('authorizeNode() Saved node session still valid');
      return SNS;
    })
    .catch((error) => {
      console.log('authorizeNode() Saved node session no longer valid: '+ error.message);
      console.debug('authorizeNode() '+ PREFIX + API_SERVER +'/api/admins/login');
      return axios.post(PREFIX + API_SERVER +'/api/admins/login', 
	{ email: API_USER, password: API_PASSWORD })
	.then((response) => {
	  auth = response.headers['x-auth'];
	  let config = {
	    headers: { 'x-auth': auth }
          };
	  config = JSON.stringify(config)
          saveNodeSession(config);
	  return config;
	})
        .catch((error) => {
          throw new TypeError(error.message + ', There was an error searching node reports');
        });
    });
  }
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function getGoogleBDLResponses(auth) {
  console.log('getGoogleBDLResponses(auth)');
  const sheets = google.sheets({version: 'v4', auth});
  const res = await sheets.spreadsheets.values.get({
    // SJI BDL Results sheet: 1TLQJW0WDX2CqZIpwRHr84o1_4M_weOyMpOI8BzRG7CE
    spreadsheetId: '1TLQJW0WDX2CqZIpwRHr84o1_4M_weOyMpOI8BzRG7CE',
    // According to this: https://stackoverflow.com/a/39641586
    // one just specifies a long enough value and the algo only copies 
    // what is there.  Not specifying the sheet name defaults to the 
    // first visible
    range: 'A1:AD10000',
    ranges: [],
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.warn('No data found.');
    return;
  }
  return rows;
}

async function getNodeBDLResponses(config) {
  if (!config) {
    console.error('getNodeBDLResponse(config) config not set');
    console.error(config);
    return null;
  } 

  console.debug('getNodeBDLResponses(config): '+ PREFIX + API_SERVER + '/api/admins/reports');
  return axios.get(PREFIX + API_SERVER + '/api/admins/reports', JSON.parse(config))
    .then((json) => {
      return json;
    })
    .catch((error) => {
      console.error('There was an error fetching the reports: ', error);
      return null;
    });
}

// Documentation of the Google BDL columns
/*
  0 A: 'Timestamp' - this is our response id, convert it to seconds since epoch
  1 B: 'When did the incident happen?',
  2 C: 'What city did the incident with the Bad Date take place?',
  3 D: 'In what area did the incident with the Bad Date take place?',
  4 E: 'What happened?',
  5 F: 'Please provide details about what happened with the Bad Date:',
  6 G: 'Your Gender',
  7 H: 'Your Type of Work',
  8 I: 'Bad Date was:',
  9 J: 'Where did the Bad Date make first contact?',
  10 K: 'If Bad Date contacted you through an Ad site, please list advertising website and their handle:',
  11 L: "Bad Date's Name",
  12 M: "Bad Date's Age ",
  13 N: "Bad Date's Phone Number",
  14 O: "Bad Date's E-mail",
  15 P: "Bad Date's Gender",
  16 Q: "Bad Date's race/ethnicity:",
  17 R: "Bad Date's Height",
  18 S: "Bad Date's Body type",
  19 T: 'Any obvious unique identifiable physical attributes?',
  20 U: "Bad Date's Vehicle Info",
  21 V: 'Do you need support?',
  22 W: 'If yes, what kind of support do you need?',
  23 X: 'If yes, please provide contact information for the best way to reach you?',
  24 Y: 'If yes, what name should we call you',
  25 Z: 'If yes, can we say we are calling from St.James?',
  26 A1: 'Additional Comments:',
  27 A2: 'What happened?',
  28 A3: '',
  29 A4: 'Comments:'
*/

// Utility functioning for displaying the results
async function printGoogleBDLResponses(responses) {
  console.debug('printGoogleBDLResponses()');
  for (const response of responses) { 
    console.debug(`${response[0]}: ${response[2]}, ${response[11]}`);
  }
  return responses;
}

async function printNodeBDLResponses(responses) {
  for (const response of responses) { 
    let date = new Date(response.date).toDateString();
    console.log(`${date}: ${response.city}, ${response.perpetrator.name}`);
  }
  return responses;
}

async function saveBDLResponses(responses) {
  console.debug('TODO');
  return responses;
}

// Imports responses from the google/forms/sheets BDL into the mongo/node BDL
// Loop across each report and using the sji-bdl-api try and find the report
//
// sji-bdl-api/api/admins/reports/search is the path we will use to determine
// if the report is recorded in the node application.  If it is not already
// entered we will add it
async function importBDLResponses(googleResponses) {
  console.debug('importBDLResponses()');
  let config = await authorizeNode();
  let first = 0;

  for (const response of googleResponses) { 
    if (!first) {
      first = 1;
      continue;
    }
    console.debug('importBDLResponses() '+`${response[0]}: ${response[2]}, ${response[11]}`);
    let url = PREFIX + API_SERVER + '/api/admins/reports/search?';
    let d2;
    let amp = 0;

    if (response[0]) {
      d = new Date(response[0]);
      month = d.getMonth() + 1;
      month = month.toString();
      month = month.padStart(2, '0');

      day = d.getDate();
      day = day.toString().padStart(2, '0');

      d2 = d.getFullYear() +'-'+ month +'-'+ day;

      url = url + querystring.stringify({ date: d2});
      amp = amp +1;
    }

    if (response[11]) {
      if (amp) {
        url = url + '&';
      } else {
        amp = amp +1;
      }

      url = url + querystring.stringify({ name: response[11]});
    }

    if (response[2]) {
      if (amp) {
        url = url + '&';
      } else {
        amp = amp +1;
      }
      url = url + querystring.stringify({ city: response[2]});
    }

    console.debug('importBDLResponses() '+ url);
    let found = await axios.get(url, JSON.parse(config))
      .catch((error) => {
        throw new TypeError(error.message + ', There was an error searching node reports');
      });

    if (found.data.length) {
      continue;
    }

    let title = '';
    let submission = {};
    if (response[2]) {
      submission.city = response[2];
      title = title.concat(response[2] + ' ');
    } else {
      submission.city = 'N/A';
    }

    if (response[3]) {
      submission.locationType = response[3];
      title = title.concat(response[3] + ' ');
    } else {
      submission.locationType = 'N/A';
    }

    submission.gender = response[6] || 'N/A';
    submission.date = d2;
    submission.asaultType = response[4];
    submission.assaultDescription = '';
    
    if(response[4]) {
      submission.assaultDescription = submission.assaultDescription.concat('What happened?: '+ response[4] +"\n");
      title = title.concat(response[4] + ' ');
    }

    if(response[5]) {
      submission.assaultDescription = submission.assaultDescription.concat('Details: '+ response[5] +"\n");
      title = title.concat(response[6] + ' ');
    }

    if(response[7]) {
      submission.assaultDescription = submission.assaultDescription.concat('Type of work: '+ response[7] +"\n");
      title = title.concat(response[7] + ' ');
    }

    if(response[8]) {
      submission.assaultDescription = submission.assaultDescription.concat('Bad date was: '+ response[8] +"\n");
      title = title.concat(response[8] + ' ');
    }

    if(response[9]) {
      submission.assaultDescription = submission.assaultDescription.concat('Bad date first made contact: '+ response[9] +"\n");
      title = title.concat(response[9] + ' ');
    }

    if(response[10]) {
      submission.assaultDescription = submission.assaultDescription.concat('Advert site info: '+ response[10] +"\n");
      title = title.concat(response[10] + ' ');
    }

    if(response[14]) {
      submission.assaultDescription = submission.assaultDescription.concat('Bad dates email: '+ response[14] +"\n");
      title = title.concat(response[14] + ' ');
    }

    if(response[26]) {
      submission.assaultDescription = submission.assaultDescription.concat('Additional Comments: '+ response[26] +"\n");
      title = title.concat(response[26] + ' ');
    }

    if(response[27]) {
      submission.assaultDescription = submission.assaultDescription.concat('What happened: '+ response[27] +"\n");
      title = title.concat(response[27] + ' ');
    }

    if(response[28]) {
      submission.assaultDescription = submission.assaultDescription.concat(response[28] +"\n");
      title = title.concat(response[28] + ' ');
    }

    if(response[29]) {
      submission.assaultDescription = submission.assaultDescription.concat('Additional Comments: '+ response[29] +"\n");
      title = title.concat(response[29] + ' ');
    }

    if (!submission.assaultDescription.length) {
      submission.assaultDescription = 'N/A';
    }

    if (!title.length) {
      title = 'N/A';
    }

    submission.support = {};
    if(response[21]) {
      submission.support.needSupport = response[21];
    } else {
      submission.support.needSupport = "No";
    }

    if(response[22]) {
      submission.support.needSupport = 
        submission.support.needSupport.concat("\n"+'kind of suppoort needed: '+ response[22]);
    }

    if(response[23]) {
      submission.support.contact = response[23];
    }

    if(response[24]) {
      submission.support.name = response[24];
    }

    if(response[25]) {
      submission.support.callingFrom = response[25];
    }

    submission.perpetrator = {};
    submission.perpetrator.name = response[11] || 'N/A';
    submission.perpetrator.phone = response[13];
    submission.perpetrator.gender = response[15] || 'N/A';
    submission.perpetrator.age = response[12] || 'N/A';
    submission.perpetrator.race = response[16] || 'N/A';
    submission.perpetrator.height = response[17] || 'N/A';
    submission.perpetrator.perpType = 'N/A';
    submission.perpetrator.attributes = "";

    if (response[19]) {
      submission.perpetrator.attributes = response[19];
    }

    if (response[18]) {
      submission.perpetrator.attributes = 
        submission.perpetrator.attributes.concat(" body type: "+ response[18]);
    }

    if (response[20]) {
      submission.perpetrator.vehicle = response[20];
    }

    submission.perpetrator.hair = 'N/A';

    /*  There is no edited report we can easily pull from so we will build this
     *  from what we have */
    submission.editedReport = {};
    submission.editedReport.title = 
      title.split(" ").slice(0, 5).join(" ");
    submission.editedReport.content = submission.assaultDescription;
    // This publishes the report
    submission.edited = true;

    // TODO: look this up from the submission.city
    submission.geolocation = {};
    submission.geolocation.type = 'Point';
    // aka 1089 Mission St., SF, CA, 94103
    submission.geolocation.coordinates = [ -122.4104418002654, 37.77957783530549 ];
   
    url = PREFIX + API_SERVER + '/api/reports/new';
    console.log('importBDLResponses() '+ url);

    // we do not need to authenticate to add a report
    //let report = await axios.post(url, submission, JSON.parse(config))
    let report = await axios.post(url, submission)
      .catch((error) => {
        console.debug('importBDLResponses() adding report failed: '+ Object.keys(error));
        console.debug(error.response.data.error);
        throw new TypeError(error.message + ', There was an error adding a node report');
      });
    console.log('importBDLResponses() added submission');
  }
  return googleResponses;
}

// We should search by date city and bad date name
function isGoogleReportInNode(gReport, node, config) {
  var gDate = gReport[0];
  var gCity = gReport[2];
  var gBDName = gReport[11];

  var path = prefix + server +'/api/admins/reports/search?date='
    + $gDate +'&city='
    + $gCity +'&name='
    + $gBDName;
  console.debug('isGoogleReportInNode path: '+ path);

  axios.get(path)
    .then((response) => {
      console.debug('isGoogleReportInNode response: ');
      console.debug(response);
    })
    .catch(next);
}

/*
This is what a bad date report looks like from the /api/admins/reports
{
  assaultType: [ 'Robbery', 'Client drunk/high' ],
  edited: false,
  _id: '63cf2fc3e59ffc1509471218',
  city: 'San Francisco',
  locationType: 'Hotel/Motel',
  geolocation: {
    type: 'Point',
    _id: '63cf2fc3e59ffc1509471219',
    coordinates: [ -122.41, 37.77 ]
  },
  gender: 'female',
  date: '2016-05-18T16:00:00.000Z',
  assaultDescription: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse molestie rutrum lorem. Green pants. Cras feugiat nulla augue, eget fringilla odio ultrices a. Duis eu bibendum metus.',
  perpetrator: {
    _id: '63cf2fc3e59ffc150947121a',
    name: 'Bobby',
    phone: '5555555555',
    email: 'test@test.com',
    perpType: 'cop',
    gender: 'male',
    age: '32',
    race: 'white',
    height: "5'10",
    hair: 'black hair',
    attributes: 'tattoo on right arm'
  },
  __v: 0
}
 */

// Exports responses from the mongo/node BDL to the google/forms/sheets BDL
async function exportBDLResponses(responses) {
  console.debug('TODO');
  return responses;
}

// for each google report
// check if report exists in node
// if not, then add it to node
async function main() {
  let gResponses;
  await authorize()
    .then(getGoogleBDLResponses)
    .then(importBDLResponses)
    //.then(printGoogleBDLResponses)
    .catch((error) => {
      console.debug(error);
    });
}

main()
  .then(() => process.exit(0), e => { console.error(e); process.exit(1) });
