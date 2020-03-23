/* global primary_artist, primary_artist_tracks, related_artists, related_artists_tracks */

// Comments are for the weak minded. Expect none here
(()=>{
	fetch('/api/SpotifyAPI', {
		method: 'POST',
		body: JSON.stringify({
			method: 'getArtistAbout',
			args: [primary_artist.id]
		})
	})
		.then(res=>res.text())
		.then(result=>{
			const parser = new DOMParser();
			window.primary_artist_about_doc = parser.parseFromString(result, 'text/html');
			window.primary_artist_about = (new Function(
				[...window.primary_artist_about_doc.scripts]
					.find(script=>/^\s*Spotify\s*=/.test(script.innerHTML))
					.innerHTML + '; return(Spotify.Entity)'
			))();
			
			const insights = window.primary_artist_about.insights;
			insights.average_features = {};
			for (const feature of ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo']) {
				insights.average_features[feature] = primary_artist_tracks
					.map(track=>track[feature])
					.reduce((total, value)=>total+value)
					/ primary_artist_tracks.length;
			}
			insights.average_features.key_mode = mode(window.primary_artist_tracks.map(track=>track.key_mode));
			
			window.primary_artist_tracks_top = primary_artist_tracks.sort((trackA, trackB)=>trackA.popularity-trackB.popularity).slice(0, Math.ceil(primary_artist_tracks.length/10));
			insights.average_features_top = {};
			for (const feature of ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo']) {
				insights.average_features_top[feature] = window.primary_artist_tracks_top
					.map(track=>track[feature])
					.reduce((total, value)=>total+value)
					/ window.primary_artist_tracks_top.length;
			}
			insights.average_features_top.key_mode = mode(window.primary_artist_tracks_top.map(track=>track.key_mode));
			
			document.querySelector('#backdrop').style.backgroundImage = `url(${insights.header_image.uri})`;
			document.querySelector('#backdrop>h1').textContent = window.primary_artist_about.name;
			
			for (const key in insights.average_features) {
				hydrateStatTemplate('#stats-stat', key, insights.average_features[key]);
			}
			hydrateStatTemplate('#stats-stat', 'popularity', window.primary_artist_about.popularity);

			const bioNodes = [...window.primary_artist_about_doc.querySelectorAll('.bio-primary, .bio-secondary')].map(n=>n.cloneNode(true));
			for (const bioNode of bioNodes) {
				for (const link of bioNode.querySelectorAll('a')) {
					link.replaceWith(...link.childNodes);
				}
			}
			document.querySelector('#spotify-about').append(...bioNodes);
		});
})();

function hydrateStatTemplate(templateId, key, value) {
	const nTemplate = document.querySelector(templateId);
	const nCloned = nTemplate.content.cloneNode(true);
	nCloned.querySelector('.stat-row').style.backgroundImage = `url(/html/svg/${key}.svg)`;
	nCloned.querySelector('.stat-name').innerText = key;
	if (key == 'key_mode') {
		nCloned.querySelector('.stat-value').innerText = value;
		nCloned.querySelector('.stat-name').innerText = 'Key';
		nCloned.querySelector('.stat-value').style.fontSize = 'calc(var(--w) / 4)';
		nCloned.querySelector('.stat-value').style.textTransform = 'capitalize';
		nCloned.querySelector('.stat-row').classList.add('nobar');
	} else if (key == 'loudness') {
		nCloned.querySelector('.stat-value').innerText = `${Math.round(value)}db`;
		nCloned.querySelector('.stat-value').style.fontSize = 'calc(var(--w) / 4)';
		value = Math.max(0, Math.min((value+40)/40, 1));
	} else if (key == 'tempo') {
		nCloned.querySelector('.stat-value').innerText = `${Math.round(value)}bpm`;
		nCloned.querySelector('.stat-value').style.fontSize = 'calc(var(--w) / 5)';
		value = Math.max(0, Math.min((value-50)/150, 1));
	} else if (key == 'popularity') {
		nCloned.querySelector('.stat-row').classList.add('popularity');
		nCloned.querySelector('.stat-value').innerText = Math.round(value);
		value /= 10;
	} else {
		nCloned.querySelector('.stat-value').innerText = Math.round(value*10);
	}
	
	nCloned.querySelector('.stat-bar-fill').style.borderColor = `hsl(${Math.round(value*120)}, 85%, 65%)`;
	nCloned.querySelector('.stat-bar-fill').style.transform = `rotate(${180*value+45}deg)`;
	nTemplate.parentElement.append(nCloned);
}

function mode(arr){
	return arr.sort((a,b)=>
		arr.filter(v=>
			v===a
		).length - arr.filter(v => v===b).length
	).pop();
}