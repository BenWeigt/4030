

const fs = require('fs').promises;
const OAuth = require('./SpotifyOAuthToken');
const https = require('https');
const dataDir = 'data/SpotifyAPI';


/**
https://developer.spotify.com/documentation/web-api/reference/artists/get-artists-albums/
https://developer.spotify.com/documentation/web-api/reference/artists/get-artists-top-tracks/
https://developer.spotify.com/documentation/web-api/reference/tracks/get-several-audio-features/
 */


/**
 * https://developer.spotify.com/documentation/web-api/reference/search/search/
 */
exports.getArtistSearch = async (term, lim = 5)=>{
	return await getWebAPIEndpoint(`/v1/search?q=${encodeURIComponent(term)}&type=artist&limit=${lim}`);
};

exports.getArtist = getArtist;
exports.getArtistAbout = getArtistAbout;
exports.getRelatedArtists = getRelatedArtists;
exports.getTopTracks = getTopTracks;
exports.getAudioFeatures = getAudioFeatures;
exports.getAlbums = getAlbums;

exports.fetchHtml = fetchHtml;

exports.getFullArtistAndRelated = async (id)=>{
	async function _extendArtistModel(artist){
		const albums = getAlbums(artist.id);
		const topTracks = (await getTopTracks(artist.id)).tracks;
		const about = getArtistAbout(artist.id);
		let topTracksAudioFeatures = await getAudioFeatures(...topTracks.map(track=>track.id));
		if (topTracks.length === 1) {
			topTracks[0].audio_features = topTracksAudioFeatures;
		} else {
			topTracksAudioFeatures = topTracksAudioFeatures.audio_features;
			topTracksAudioFeatures.reverse();
			for (const track of topTracks) {
				track.audio_features = topTracksAudioFeatures.pop();
			}
		}
		
		artist.top_tracks = topTracks;
		artist.albums = await albums;
		artist.about = await about;
		
		return artist;
	}
	
	let artist = await retrive('full_artist_and_related', id);
	if (artist)
		return artist;
	
	artist = await getArtist(id);
	const related = Promise.all((await getRelatedArtists(id))
		.artists
		.map(_extendArtistModel));
	artist.related_artists = await related;
	await _extendArtistModel(artist);
	await store('full_artist_and_related', id, artist);
	return artist;
};

async function getArtist(id) {
	let data = await retrive('artist', id);
	if (data)
		return data;
	data = await getWebAPIEndpoint(`/v1/artists/${id}`);
	await store('artist', id, data);
	return data;
}

async function getArtistAbout(id) {
	let data = await retrive('artist-about', id, 'html');
	if (data)
		return data;
	data = await fetchHtml(`https://open.spotify.com/artist/${id}/about`);
	await store('artist-about', id, data, 'html');
	return data;
}

async function getRelatedArtists(id) {
	let data = await retrive('related-artists', id);
	if (data)
		return data;
	data = await getWebAPIEndpoint(`/v1/artists/${id}/related-artists`);
	for (const artist of data.artists) {
		store('artist', artist.id, artist, 'json', false);
	}
	await store('related-artists', id, data);
	return data;
}

async function getTopTracks(id) {
	let data = await retrive('top-tracks', id);
	if (data)
		return data;
	data = await getWebAPIEndpoint(`/v1/artists/${id}/top-tracks?country=US`);
	for (const track of data.tracks) {
		store('track', track.id, track, 'json', false);
	}
	await store('top-tracks', id, data);
	return data;
}

async function getAudioFeatures(...ids) {
	if (ids.length === 1) {
		const [id] = ids;
		let data = await retrive('audio-features', id);
		if (data)
			return data;
		data = await getWebAPIEndpoint(`/v1/audio-features/${id}`);
		await store('audio-features', id, data);
		return data;
	}
	
	let audioFeatures = await Promise.all(ids.map(id=>retrive('audio-features', id)));
	let query = ids.filter((id, i)=>!audioFeatures[i]).join(',');
	if (query) {
		let {audio_features: queriedAudioFeatures} = await getWebAPIEndpoint(`/v1/audio-features/?ids=${query}`);
		for (const data of queriedAudioFeatures) {
			store('audio-features', data.id, data);
		}
		queriedAudioFeatures.reverse();
		audioFeatures = audioFeatures.map(data=>data||queriedAudioFeatures.pop());
	}
	return {audio_features: audioFeatures};
}

async function getAlbums(id) {
	let data = await retrive('albums', id);
	if (data)
		return data;
	let items = [], i = 0;
	do {
		data = await getWebAPIEndpoint(`/v1/artists/${id}/albums?offset=${50*i++}&limit=50`);
		items = items.concat(data.items);
	} while (data.next);	
	
	await store('albums', id, items);
	return items;
}

/**
 * Util
 */
async function getWebAPIEndpoint(path) {
	const url = 'https://api.spotify.com' + path;
	const options = await getHttpsOptions();
	
	console.log(`\t\t<=> ${url}`);
	
	return await (new Promise((resolve, reject)=>{
		https.get(url, options, res=>{
			const {statusCode} = res;
			const contentType = res.headers['content-type'];
		
			let error = statusCode !== 200;
			if (statusCode >= 500 || !/^application\/json/.test(contentType)) {
				error = new Error(`\n\t\t\tError: Code ${statusCode} with content type ${contentType} for ${url}`);
				res.resume();
				reject(error);
				return;
			}
			
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', chunk=>{rawData+=chunk;});
			res.on('end', ()=>{
				try {
					const data = JSON.parse(rawData);
					if (error) {
						console.log(data);
						if (statusCode === 401) {
							console.log('\t\t\tError: Access token expired.\n\t\t\tExiting: Old access token has been cleared, please relaunch.');
							fs.unlink('data/SpotifyOAuthToken/token');
							process.exit();
						}
						reject(new Error(`\n\t\t\tError: Code ${statusCode} for ${url}. Data logged above.`));
						return;
					}
					resolve(data);
				} catch (err) {
					reject(err);
				}
			});
		}).on('error', err=>{
			console.log(`\t\t\tError: https.get failed for ${url}, ${err.message}`);
		});
	}));
}

async function fetchHtml(url) {

	console.log(`\t\t<-> ${url}`);
	
	return await (new Promise((resolve, reject)=>{
		https.get(url, {
			headers: {
				'accept': '*/*',
				'accept-language': 'en-US,en;q=0.9',
				'cache-control': 'no-cache',
				'pragma': 'no-cache',
				'referer': 'http://localhost:1410/',
				'sec-fetch-dest': 'empty',
				'sec-fetch-mode': 'no-cors',
				'sec-fetch-site': 'cross-site',
				'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36'
			}
		}, res=>{
			const {statusCode} = res;
		
			let error = statusCode !== 200;
			if (statusCode !== 200) {
				error = new Error(`\n\t\t\tError: Code ${statusCode} with while requesting page content at ${url}`);
				res.resume();
				reject(error);
				return;
			}
			
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', chunk=>{
				rawData+=chunk;
			});
			res.on('end', ()=>{
				resolve(rawData);
			});
		}).on('error', err=>{
			console.log(`\t\t\tError: https.get failed for ${url}, ${err.message}`);
		});
	}));
}

async function getHttpsOptions() {
	const token = await OAuth.get();
	return {
	  headers: {
			'Accept': 'application/json',
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		}
	};
}

async function store(type, key, data, format = 'json', overwrite = true) {
	if (!overwrite) {
		try {
			const raw = await fs.readFile(`${dataDir}/${type}_${key}.${format}`, 'utf8');
			if (format === 'json' && JSON.parse(raw) || raw.length)
				return;
		} catch (err) {/* File didn't exist or was json and falsy, continue to create */}
	}
	await fs.mkdir(dataDir, {recursive: true})
		.then(()=>fs.writeFile(`${dataDir}/${type}_${key}.${format}`, typeof data === 'string' ? data : JSON.stringify(data)));
	return data;
}

async function retrive(type, key, format = 'json') {
	try {
		const raw = await fs.readFile(`${dataDir}/${type}_${key}.${format}`, 'utf8');
		if (format === 'json')
			return JSON.parse(raw);
		return raw;
	} catch (err) {/**/}
	return null;
}