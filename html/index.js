




(()=>{
	if (document.readyState !== 'loading')
		init();
	else
		document.addEventListener('DOMContentLoaded', init);

	function init() {
		const nSearchInput = document.getElementById('search');
		const nSearchResults = document.getElementById('search-results');
		const nDetailedArtist = document.getElementById('detailed-artist');
		
		let pActiveSearch = null;
		nSearchInput.addEventListener('keyup', evt=>{
			if (evt.key === 'Enter' && !pActiveSearch) {
				pActiveSearch = fetch('/api/SpotifyAPI', {
					method: 'POST',
					body: JSON.stringify({
						method: 'getArtistSearch',
						args: [nSearchInput.value, 5]
					})
				});
				pActiveSearch
					.then(res=>res.json())
					.then(results=>{
						populateSearchResults(results.artists.items);
						pActiveSearch = null;
					});
			}
		});
		
		function populateSearchResults(artists) {
			nSearchResults.innerHTML = artists
				.map(artist=>
					`<div class="search-results-artist" data-artist-id="${artist.id}" data-name="${artist.name}" style="${ artist.images[0]?`background-image:url(${artist.images[0].url});`:'' }"></div>`)
				.join('');
			for (const nArtist of nSearchResults.querySelectorAll('.search-results-artist')) {
				nArtist.addEventListener('click', evt=>{
					nSearchResults.classList.add('hide');
					nSearchInput.classList.add('hide');
					fetch('/api/SpotifyAPI', {
						method: 'POST',
						body: JSON.stringify({
							method: 'getFullArtistAndRelated',
							args: [nArtist.dataset.artistId]
						})
					})
						.then(res=>res.json())
						.then(result=>{
							window.fullArtistData = result;
							const parser = new DOMParser();
							const doc = parser.parseFromString(result.about, 'text/html');
							for (const link of doc.querySelectorAll('a')) {
								link.replaceWith(...link.childNodes);
							}
							nDetailedArtist.innerHTML = [...doc.querySelectorAll('.bio-primary, .bio-secondary')].map(n=>n.outerHTML).join('\n');
							nDetailedArtist.classList.remove('hide');
							console.log(result);
						});
				});
			}
		}
	}
})();