# Import and attach libraries/packages
packages = c('devtools', 'jsonlite', 'vosonSML', 'magrittr', 'slam', 'tm', 'igraph', 'stringr')
install.packages(setdiff(packages, rownames(installed.packages())))
lapply(setdiff(packages, .packages()), library, character.only = TRUE)

# Set up authentication variables
appname = '4030ICTBigData'
my_api_key = 'o9u0Sl8uUgpyLwIiImteKqjP6'
my_api_secret = 'kbGy21A943rUpXT1gpwDFRppL7tPlXMrlJkykP3GCz0QuNSfEr'
my_access_token = '894681929038962688-cKu4LfqHVkzdFyJE8FSG3AS0R5ZI02a'
my_access_token_secret = 'd1XwVHPmoiu2cbiBtPFB7zA4Ts4kH1tn5Alu6MlwIT6iJ'

# Authenticate and get data (disabled so as to not accidentaly overwrite our working set)
if (false) {
  myTwitterData = Authenticate(
    'twitter',
    appName=appname,
    apiKey=my_api_key,
    apiSecret=my_api_secret,
    accessToken=my_access_token,
    accessTokenSecret=my_access_token_secret,
    useCachedToken = F
  ) %>%
    Collect(searchTerm='-filter:retweets Death Cab for Cutie', language='en', numTweets=18000, writeToFile=FALSE)
}



# Create Actor Network and Graph (and Write to File)
g_twitter_actor_network = myTwitterData %>% Create('actor')
g_twitter_actor_graph = Graph(g_twitter_actor_network)
V(g_twitter_actor_graph)$name = V(g_twitter_actor_graph)$screen_name
V(g_twitter_actor_graph)$label = V(g_twitter_actor_graph)$screen_name


# Run Page Rank Algorithm to Find Important Users
pagerank_actor = sort(page.rank(g_twitter_actor_graph)$vector, decreasing=TRUE)
head(pagerank_actor, n=10)

# Create Semantic Network and Graph (and Write to File)
g_twitter_semantic_network = myTwitterData %>% Create('semantic', stopwordsEnglish = T)
g_twitter_semantic_graph = Graph(g_twitter_semantic_network)


# Run Page Rank Algorithm to Find Top 10 Important Terms
pagerank_semantic = sort(page_rank(g_twitter_semantic_graph)$vector, decreasing=TRUE)
head(pagerank_semantic, n=10)

# Try the Analysis Again but with a Semantic Network of the 50% most Frequent Terms (Complete this part of the script yourself!)
g_twitter_semantic_network_50_allterms = myTwitterData %>% 
  Create('semantic', termFreq=50, removeTermsOrHashtags=c('Death Cab for Cutie'))
g_twitter_semantic_network_50_allterms = Graph(g_twitter_semantic_network_allTerms)

# disabled so as to not accidentaly overwrite our working set
#save(myTwitterData, file='../data/R/twitter/tweets.Rda')
#write(jsonlite::toJSON(myTwitterData), '../data/R/twitter/tweets.json')
write.graph(g_twitter_actor_graph, '../data/R/twitter/twitter_actors.graphml', format='graphml')
write.graph(g_twitter_semantic_graph, '../data/R/twitter/twitter_semantic.graphml', format='graphml')
write.graph(g_twitter_semantic_network_50_allterms, '../data/R/twitter/twitter_semantic_50_allterms.graphml', format='graphml')
