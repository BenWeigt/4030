/* eslint-disable quotes */
/* eslint-disable no-console */
/**
 * Note: This is an unsecured nightmare of an implementation that should never be run outside 
 *       of strictly trusted senarios. Obviously, DO NOT DEPLOY.
 */
const port = 1410;

const http = require('http');
const fs = require('fs');
const url = require('url');
const oauth = require('./api/SpotifyOAuthToken');

// eslint-disable-next-line no-unused-vars
let config;

const disableAuthRedirect = true;
let haveToken;
let authenticating = false;

http.createServer(async (req, res)=>{
	try {
		config = JSON.parse(await fs.promises.readFile('config.json', 'utf8'));
	} catch (error) {
		console.log('No config found.\nMake sure there is a config.json at the root of this project containing {"client_id": "your spotify client id"}.\nExiting.');
		process.exit();
	}
	
	const path = url.parse(req.url).pathname.substr(1);
	
	if (!path) {
		if (!disableAuthRedirect && !haveToken && !(haveToken = await checkForToken())) {
			if (!authenticating) {
				respondFromHtml(res, 'html/OAuth/SpotifyGetToken.html');
				authenticating = true;
				return;
			}
			respondFromHtml(res, 'html/OAuth/SpotifyReturnToken.html');
		} else {
			res.writeHead(302, {Location: 'html/index.html'});
			res.end();
			console.log(` 302 ->html/index.html`);
		}
	} else if (path.substr(0,4) === 'api/') {
		respondFromApi(req, res, path);
	} else if (path.substr(0,5) === 'html/') {
		respondFromHtml(res, path);
	} else {
		res.writeHead(404);
		res.end();
		console.log(` 404 ${path}`);
	}
	
	authenticating = false;
}).listen(port, 'localhost');

console.log(`Temp server started: waiting on http://localhost:${port}/`);

/**
 * Util
 */
function respondFromApi(req, res, path) {
	try {
		const API = require('./'+path);
		const chunks = [];
		req.on('data', chunk=>{
			chunks.push(chunk);
		});
		req.on('end', ()=>{
			const body = Buffer.concat(chunks).toString();
			console.log(` API ${path}: ${body}`);
			const {method, args} = JSON.parse(body);
			API[method].apply(API, args).then(data=>{
				res.writeHead(200);
				res.write(typeof data === 'string' ? data : JSON.stringify(data));
				res.end();
			});
		});
	} catch (err) {
		res.writeHead(404);
		res.end();
		console.log(` 404 ${path}`);
		return;
	}
}

function respondFromHtml(res, path) {
	fs.readFile(path, 'utf8', async (err, data)=>{
		if (err) {
			res.writeHead(404);
			res.end();
			console.log(` 404 ${path}`);
			return;
		}
		
		// Some quick and dodgy moustache-lite processing. Feel free to dm me your disgust.
		// We'll be loosly supporting {{statement}}. Statements can optionally return promises 
		// that will be resolved before insertion.
		const terms = await Promise.all(
			[...data.matchAll(/{{.*?}}/gm)]
				.map(match=>eval(match[0].slice(2, -2)))
				.reverse()
		);
		data = data.replace(/{{.*?}}/gm, ()=>terms.pop());
		
		res.writeHead(200);
		res.write(data);
		res.end();
		console.log(` GET ${path}`);
	});
}

async function checkForToken() {
	const token = await oauth.get();
	if (token)
		console.log(`OAuth token: ${token}`);
	return !!token;
}