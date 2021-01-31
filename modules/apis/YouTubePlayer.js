import * as MusicStreaming from '../config.js'

export class YouTubePlayer
{

	static findPlayer(playerId)
	{
		return game.getStreamingApi('youtube').getPlayerAt(playerId);
	}

	static findPlayerByIds(ownerId, soundId)
	{
		return YouTubePlayer.findPlayer(`youtube-player-${ownerId}-${soundId}`);
	}

	static _onYTPlayerStateChange(playerId, evt)
	{
		YouTubePlayer.findPlayer(playerId).onYTPlayerStateChange(evt);
	}

	static _onYTPlayerReady(playerId, evt)
	{
		YouTubePlayer.findPlayer(playerId).onYTPlayerReady(evt);
	}

	static _onError(sourceId, pid, evt)
	{
		if (evt.data === 2 && sourceId === '') { return; }
		var errorMessage = 'unknown';
		switch (evt.data)
		{
			case 2:
				errorMessage = 'Invalid ID value';
				break;
			case 5:
				errorMessage = 'Content is not supported by HTML5 player';
				break;
			case 100:
				errorMessage = 'Video not found';
				break;
			case 101:
			case 150:
				errorMessage = 'Embedded player not supported by owner';
				break;
			default:
		}
		console.error('Error in youtube player', {
			code: evt.data,
			message: errorMessage,
			sourceId: sourceId,
		});
		
			//As below, this is a horrible hack. Needs actually fixed
		let playlist = game.playlists.get(YouTubePlayer.findPlayer(pid).ownerId);
		if (playlist) { 
			playlist._onEnd(YouTubePlayer.findPlayer(pid).soundId);
		}

	}

	constructor(ownerId, soundId, sourceId)
	{
		this.ownerId = ownerId;
		this.soundId = soundId;
		this.player = null;
		// minimum size specified by https://developers.google.com/youtube/youtube_player_demo
		this.size = {
			width: '480px',
			height: '270px',
		};
		this.volume = 0;
		this.videoId = sourceId;
		this.bPlayerReady = false;
		this.bShouldBePlaying = false; // if the video is waiting to play as soon as it loads
		this.shouldLoop = false; // if the player should loop after having completed playing the video
		
		if (!this.api.isReady())
		{
			Hooks.on('music-streaming:apiLoaded', this.anApiLoaded.bind(this));
		}
		this.api.setPlayerAt(this.playerId, this);
	}

	get api()
	{
		return game.getStreamingApi('youtube');
	}

	get playerId()
	{
		return `youtube-player-${this.ownerId}-${this.soundId}`;
	}

	anApiLoaded({api})
	{
		if (api !== 'youtube') { return; }
		//this.createPlayer();
	}

	/**
	 * Returns false if the wrapped player does not currently exist.
	 * Will always be false if the track to be played is not playing.
	 */
	hasPlayer()
	{
		return this.player !== null && this.player !== undefined;
	}

	/**
	 * Create the player only while it is needed.
	 * Playing a track should create the iframe, stopping one will delete it.
	 * Pausing a track should allow the iframe to stick around.
	 */
	createPlayer(sourceId)
	{
		if (!this.api.isReady()) { 
			Hooks.on(`${MusicStreaming.name}:apiLoaded`, () => {
				this.createPlayer(sourceId);
			});
			return;
		}
		console.log('Loading player with video id', sourceId);
		this.player = new YT.Player(this.playerId, {
			...this.size,
			videoId: sourceId,
			events: {
				'onReady': YouTubePlayer._onYTPlayerReady.bind(null, this.playerId),
				'onStateChange': YouTubePlayer._onYTPlayerStateChange.bind(null, this.playerId),
				'onError': YouTubePlayer._onError.bind(null, this.videoId, this.playerId),
			},
		});
		console.log('CreatingPlayer', this.player, this.player.playerInfo);
	}

	onYTPlayerStateChange(evt)
	{
		console.log('player-state', evt);
		if (this.hasEnded())
		{
			if (this.shouldLoop) {
				this.startPlaying();
			} else {
				if(this.ownerId) {
					//Horrible hack to get playlists to work. Needs big refactor
					let playlist = game.playlists.get(this.ownerId);
					if (playlist) { 
						playlist._onEnd(this.soundId);
					}
				}
			}
		}
	}

	setSourceId(sourceId)
	{
		const isNew = this.videoId !== sourceId;
		this.videoId = sourceId;
		if (this.hasPlayer())
		{
			if (isNew)
			{
				this.stopPlaying();
				this.player.cueVideoById(this.videoId);
			}
		}
		else
		{
			this.createPlayer(this.videoId);
		}
	}

	// Happens on video load
	onYTPlayerReady(evt)
	{
		this.bPlayerReady = true;
		console.log('Player Ready', this.player, this.bShouldBePlaying, this.player.playerInfo);
		this.setVolume(this.volume);
		if (this.bShouldBePlaying)
		{
			this.startPlaying();
		}
	}

	canQueryState()
	{
		return this.hasPlayer() && typeof(this.player.getPlayerState) === 'function';
	}

	isLoaded()
	{
		// 3 = buffering
		return this.canQueryState() ? this.player.getPlayerState() !== 3 : false;
	}

	isPlaying()
	{
		return this.canQueryState() ? this.player.getPlayerState() === 1 : false;
	}

	hasEnded()
	{
		return this.canQueryState() ? this.player.getPlayerState() === 0 : false;
	}

	/**
	 * Ensures that the player's playing state matches `bShouldBePlaying`.
	 * If the state already matches, no changes are made.
	 */
	ensurePlaying(bShouldBePlaying)
	{
		if (this.bPlayerReady && this.isPlaying() == bShouldBePlaying) return;
		if (bShouldBePlaying) this.startPlaying();
		else this.stopPlaying();
	}

	startPlaying()
	{
		var bAwaitingLoad = !this.hasPlayer() || !this.bPlayerReady || !this.isLoaded();
		console.log('startPlaying awaiting?', bAwaitingLoad, this.hasPlayer() ? typeof(this.player.getPlayerState) : 'no-player', this.isPlaying());
		if (!bAwaitingLoad && !this.isPlaying())
		{
			this.player.playVideo();
		}
		else
		{
			this.bShouldBePlaying = true;
		}
	}

	reload()
	{
		this.player.loadVideoById(this.videoId);
	}

	stopPlaying()
	{
		console.log('stopPlaying');
		if (this.hasPlayer() && this.isPlaying())
		{
			this.player.stopVideo();
			
			this.player.destroy();
			this.player = null;
			this.bPlayerReady = false;
		}
	}

	setLoop(bLoop)
	{
		this.shouldLoop = bLoop;
	}

	setVolume(volume)
	{
		this.volume = volume;
		if (this.hasPlayer() && typeof(this.player.setVolume) === 'function')
		{
			this.player.setVolume(volume * 100);
		}
	}

	delete()
	{
		if (this.hasPlayer())
		{
			if (this.isPlaying())
			{
				this.player.stopVideo();
			}
			this.player.destroy();
			this.player = null;
			this.bPlayerReady = false;
			$(`div#${this.playerId}`).closest('div.yt-player').remove();
		}
	}

}
