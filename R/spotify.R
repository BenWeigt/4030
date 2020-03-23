# Import and attach libraries/packages
packages = c('spotifyr', 'jsonlite', 'lubridate', 'httpuv', 'ggridges', 'highcharter', 'knitr', 'tm', 'tidyverse', 'igraph', 'ggplot2', 'stringr', 'scales')
install.packages(setdiff(packages, rownames(installed.packages())))
lapply(packages, library, character.only=TRUE)

# Configure Application to Store Spotify Authentication Data
options(httr_oauth_cache=TRUE)

# Perform Authentication (for both spotify libraries)
Sys.setenv(SPOTIFY_CLIENT_ID='211495761f5d472c9602d99ff1551a50')
Sys.setenv(SPOTIFY_CLIENT_SECRET='1a7b926863e84686a9efc88c23e4fea2')

# Get an artists entire track list, flattened and extended to include audio features and lyrics (lookup via genius.com)
get_artist_tracks = function(artist_id) {
  artist_albums = get_artist_albums(artist_id, include_groups=c('album', 'single'), include_meta_info=TRUE)
  num_loops_artist_albums = ceiling(artist_albums$total/20)
  if (num_loops_artist_albums > 1) {
    artist_albums = map_df(1:num_loops_artist_albums, function(this_loop) {
      get_artist_albums(artist_id, include_groups=c('album', 'single'), offset=(this_loop - 1) * 20)
    })
  } else {
    artist_albums = artist_albums$items
  }
  
  artist_albums = artist_albums %>%
    rename(album_id=id, album_name=name) %>%
    mutate(
      album_release_year = case_when(
        release_date_precision == 'year' ~ suppressWarnings(as.numeric(release_date)),
        release_date_precision == 'day' ~ year(as.Date(release_date, '%Y-%m-%d', origin = '1970-01-01')),
        TRUE ~ as.numeric(NA)
      )
    )
  
  artist_albums = dedupe_album_names(artist_albums)
  
  album_tracks = map(
    artist_albums$album_id,
    function(this_album_id) {
      album_tracks = get_album_tracks(this_album_id, include_meta_info=TRUE)
      num_loops_album_tracks = ceiling(album_tracks$total/20)
      if (num_loops_album_tracks > 1) {
        album_tracks = map_df(
          1:num_loops_album_tracks,
          function(this_loop) {
            get_album_tracks(this_album_id, offset=(this_loop-1)*20)
          }
        )
      } else {
        album_tracks = album_tracks$items
      }
      return (album_tracks)
    }
  )
  
  dupe_columns = c('album.album_type', 'external_ids.isrc', 'external_urls.spotify')
  album_tracks = map_df(
    album_tracks,
    function(album_tracks) {
      num_of_tracks = nrow(album_tracks)
      num_loops_album_tracks = ceiling(num_of_tracks/20)
      if (num_loops_album_tracks > 1) {
        album_tracks = map_df(
          1:num_loops_album_tracks,
          function(this_loop) {
            offset = (this_loop-1)*20;
            end = min(offset+20, num_of_tracks)
            return(get_tracks(album_tracks$id[offset:end]))
          }
        )
      } else {
        album_tracks = get_tracks(album_tracks$id)
      }
      album_tracks = album_tracks %>%
        rename(
          album_artists=album.artists,
          album_available_markets=album.available_markets,
          album_href=album.href,
          album_id=album.id,
          album_images=album.images,
          album_name=album.name,
          album_release_date=album.release_date,
          album_release_date_precision=album.release_date_precision,
          album_total_tracks=album.total_tracks,
          album_type=album.type,
          album_uri=album.uri,
          album_external_urls_spotify=album.external_urls.spotify,
          track_name=name, 
          track_uri=uri, 
          track_preview_url=preview_url,
          track_href=href,
          track_id=id
        )
      return(album_tracks)
    }
  ) %>%
    select(-dupe_columns)
  
  audio_track_columns = colnames(album_tracks)
  num_loops_tracks = ceiling(nrow(album_tracks)/100)
  track_audio_features = map_df(
    1:num_loops_tracks,
    function(this_loop) {
      track_ids = album_tracks %>% slice(((this_loop * 100) - 99):(this_loop * 100)) %>% pull(track_id)
      get_track_audio_features(track_ids)
    }
  )
  
  track_audio_feature_columns = colnames(track_audio_features)
  track_audio_features = track_audio_features %>%
    select(-intersect(audio_track_columns, track_audio_feature_columns)) %>%
    rename(track_id=id) %>%
    left_join(album_tracks, by='track_id')
  
  artist_tracks = artist_albums %>%
    select(setdiff(colnames(artist_albums), colnames(track_audio_features)), album_id=album_id) %>%
    left_join(track_audio_features, by='album_id') %>%
    mutate(
      key_name=pitch_class_lookup[key + 1],
      mode_name=case_when(mode == 1 ~ 'major', mode == 0 ~ 'minor', TRUE ~ as.character(NA)),
      key_mode=paste(key_name, mode_name),
      artist_id=artists[[1]]$id[[1]],
      artist_name=artists[[1]]$name[[1]]
    ) %>%
    mutate(album_artists=NULL, artists=NULL, images=NULL)
  
  track_lyrics = mapply(function(a, b){
    lyrics = genius::possible_lyrics(artist=a, song=b, info='simple')
    lyrics = lyrics[['lyric']]
    return(lyrics)
  }, artist_tracks$artist_name, artist_tracks$track_name)
  artist_tracks$lyrics = track_lyrics
  
  return(artist_tracks)
}

primary_artist_id = '0YrtvWJMgSdVrk3SfNjTbx';
primary_artist = get_artist(primary_artist_id)
primary_artist_tracks = get_artist_tracks(primary_artist_id)

# Conclusive proof that R is the most poorly concieved pile of trash ever concocted.
# Find another language that f##ks up a simple push like R does. Also, apparently 
# arrays begin at 1, and you index via the insane [[1]] syntax... probably. There is
# no consistent language values here, just a collection of the worst ideas found in
# other broadly avoided or defunct systems. The documentation is hot trash too.
related_artists = get_related_artists(primary_artist_id)
related_artists_tracks = list()
for(related_artist_id in related_artists$id){
  r_is_trash = get_artist_tracks(related_artist_id)
  related_artists_tracks[[length(related_artists_tracks)+1]] <- r_is_trash
}

# Save everything
save(primary_artist, file='../data/R/spotify/primary_artist.Rda')
write(jsonlite::toJSON(primary_artist), '../data/R/spotify/primary_artist.json')

save(primary_artist_tracks, file='../data/R/spotify/primary_artist_tracks.Rda')
write(jsonlite::toJSON(primary_artist_tracks), '../data/R/spotify/primary_artist_tracks.json')

save(related_artists, file='../data/R/spotify/related_artists.Rda')
write(jsonlite::toJSON(related_artists), '../data/R/spotify/related_artists.json')

save(related_artists_tracks, file='../data/R/spotify/related_artists_tracks.Rda')
write(jsonlite::toJSON(related_artists_tracks), '../data/R/spotify/related_artists_tracks.json')



#
#
#
#
#





# Get Backstreet Boys Feature Data
#backstreetBoys = get_artist_audio_features('backstreet boys')
#view(backstreetBoys)
#
## Get Happiest Songs from the Backstreet Boys (If the '-' symbol does not preceed valence, we sort tracks in ascending rather than descending order)
#backstreetBoys %>% 
#	arrange(-valence) %>% 
#	select(track_name, artist_name, valence) %>%
#	head(10) %>%
#	kable()
#
## Plot Valence Scores for Every Album
#ggplot(backstreetBoys, aes(x=valence, y=album_name)) + 
#	geom_density_ridges() + 
#	theme_ridges() + 
#	ggtitle('Plot of Backstreet Boys\' joy distributions', subtitle='Based on valence from Spotify\'s Web API')
#
#
#
#library('Rspotify', character.only = TRUE)
#keys <- spotifyOAuth(1, '211495761f5d472c9602d99ff1551a50', '1a7b926863e84686a9efc88c23e4fea2')
## Get Taylor Swift Relationship Data
#related = getRelated('taylor swift', token=keys)
#view(related)
#topsongs = getPlaylistSongs('spotify', '4hOKQuZbraPDIfaGbM3lKI', token=keys)
#
## Construct Edges
#edges = c()
#for (artist in topsongs$artist){
#	related = getRelated(artist, token=keys)
#	for (relatedartist in related$name){
#		edges = append(edges, artist)
#		edges = append(edges, relatedartist)
#	}
#}
#
## Create Graph and Save to External File
#g1 = graph(edges)
#write.graph(g1, 'g1.graphml', format='graphml')
