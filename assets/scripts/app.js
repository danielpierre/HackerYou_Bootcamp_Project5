'use strict';

var app = {};

// API keys
app.songkickApiKey = 'mySongkickKey';
app.zomatoApiKey = 'myZomatoKey';

app.init = function() {
	app.getUserLocation();
};

// Get the user's location
app.getUserLocation = function() {
	$('#locationSearchForm').on('submit', function(e) {
		// prevent default action
		e.preventDefault();

		// Select input that contains search term and get value
		var locationSearchTerm = $('#locationSearchTerm').val();

		// Clear the input element once the value has been retrieved
		$('#locationSearchTerm').val('');

		// Call getSongkickLocations
		app.getSongkickLocations(locationSearchTerm);

		// Hide the location search form
		$('#locationSearchForm').fadeOut();

		// Retain the current wrapper height
		$('.wrapper').height(function (index, height) {
			return (height);
		});
	});
};

// Get Songkick location that matches user query
app.getSongkickLocations = function(locationQuery) {

	var locationUrl  = 'http://api.songkick.com/api/3.0/search/locations.json';

	$.ajax({
	    url: 'http://proxy.hackeryou.com',
	    dataType: 'json',
	    method:'GET',
	    data: {
	        reqUrl: locationUrl,
	        params: {
	            apikey: app.songkickApiKey,
	            query: locationQuery
	        },
	        xmlToJSON: false
	    }
	}).then(function(res) {

		// Results object containing the array of locations (should filter by displayName)
		var locations = res.resultsPage.results;

		// Extract the array of locations
		var locationArray = locations.location;

		// Extract the array of metro area objects
		var metroAreas = locationArray.map(function(location) {
			return location.metroArea;
		});

		// Remove duplicates from metroAreas array based on id value
		metroAreas =_.uniq(metroAreas, function(d) { 
			return d.id; 
		});

		app.selectSongKickLocation(metroAreas, locationQuery);
	});
};

app.selectSongKickLocation = function(locationArray, locationQuery) {
	// Iterate over locationArray and create an option
	// for each location
	locationArray.forEach(function(location) {
		// Create an option element and set its value to the metroArea id
		var option = $('<option>').val(`${location.id}`);

		// Get the full metropolitan area name
		// If the location has a state property, concatenate the metro area name, state and country
		// Otherwise, concatenate the metro area name and country
		var metroAreaName;
		if (location.hasOwnProperty('state')) {
			metroAreaName = `${location.displayName}, ${location.state.displayName} (${location.country.displayName})`;
		} else {
			metroAreaName = `${location.displayName} (${location.country.displayName})`;
		}
		// Set the option text and data attribute to the full metro area name
		option.text(metroAreaName).attr('data-metro-name', metroAreaName);
		$('#locationOptions').append(option);
	});

	// Update the select element label with the number of possible locations
	$('label[for=locationOptions]').text(
		`Select from the following ${locationArray.length} possible matches for "${locationQuery}"`
	);

	// Show the location selection form
	$('#locationSelectionForm')
		.fadeIn()
		// When the form is submitted
		.on('submit', function(e) {
			e.preventDefault();
			// Get the metropolitan area ID and name from user selection 
			var metroAreaId   = $('#locationOptions option:selected').val(),
				metroAreaName = $('#locationOptions option:selected').data('metro-name');

			// Get the number of concert listings for the selected metropolitan area
			app.countSongkickListings(metroAreaId, metroAreaName);

			// Hide the location selection form
			$('#locationSelectionForm').fadeOut();
		});
}

// Get upcoming concert events for a specified location
app.countSongkickListings = function (metroAreaId, metroAreaName) {

	var listingsUrl = `http://api.songkick.com/api/3.0/metro_areas/${metroAreaId}/calendar.json?apikey=${app.songkickApiKey}&jsoncallback=?`

	$.getJSON(listingsUrl, function(data) {

		// Count the number of events
		var totalEntries = data.resultsPage.totalEntries;

		// Count the number of pages (divide totalEntries by max results per page)
		var totalPages = Math.ceil(totalEntries / 50);

		// Check number of results 
		if (totalPages > 0) {
			// Get listings 
			app.getSongkickListings(totalPages, metroAreaId);
		} else {
			// End search and display message with restart button
			var restartBtn = $('<button>').text('Start Over').addClass('restart-btn').on('click', function () {
				location.reload();
			});

			$('#eventCount').text(`There are no upcoming event listings for ${metroAreaName}.`);
			$('#eventCount').after(restartBtn);
			$('.event-listings-container').fadeIn();
		}
	});	
};

// Get all of the event listings using the number of results pages
app.getSongkickListings = function(numberOfPages, metroAreaId) {

	var listingsUrl = `http://api.songkick.com/api/3.0/metro_areas/${metroAreaId}/calendar.json`,
		pages       = [];

	// Add page numbers to an array
	for (var i = 1; i <= numberOfPages; i++) {
		pages.push(i);
	}

	// Create an array of $.ajax requests - one request per page
	var pageRequests = pages.map(function(page) {
		return $.ajax({
		    url: 'http://proxy.hackeryou.com',
		    dataType: 'json',
		    method:'GET',
		    data: {
		        reqUrl: listingsUrl,
		        params: {
		            apikey: app.songkickApiKey,
		            page: page
		        },
		        xmlToJSON: false
		    }
		}); // $.ajax
	}); // pageRequests

	// Supply the .apply method with two arguments:
	// 1. the context for 'this' - we don't want to change this so we'll set it to null
	// 2. the array which we will use to supply the function with arguments as though
	//    they constitute a comma-separated list
	$.when.apply(null, pageRequests)
		.then(function() {			
			// Convert the list of arguments passed to the function into an array
			// This array will contain the data for each of the ajax responses
			var returnedPages = Array.prototype.slice.call(arguments);

			// Initialize an array to contain event listings
			var eventListings = [];
			
			// Determine if multiple pages were returned by checking
			// if the first item in the array is also an array
			if (Array.isArray(returnedPages[0])) {
				// Transform the array to include only event data
				returnedPages = returnedPages.map(function(page) {
					return page[0].resultsPage.results.event;
				});

				// Flatten results into one array with all the listings
				eventListings = _.flatten(returnedPages);
			} else {
				eventListings = returnedPages[0].resultsPage.results.event;
			}			

			// Call get event types
			app.selectSongkickEvent(eventListings);
		});
};

app.selectSongkickEvent = function(eventsArray) {

	//----- DATA TRANSFORMATION ------------------------------

	// Remove duplicates from the events array based on id value
	eventsArray =_.uniq(eventsArray, function(d) { 
		return d.id; 
	});

	// Add a date string property and to each event in the events array
	// and fill in the event display name and artist URI properties
	// if they are missing
	eventsArray.forEach(function(event, index) {
		// Use the datetime property if not null
		if (event.start.datetime) {
			event.dateString = getDateString(new Date(event.start.datetime));
		} else if (event.start.date) {
			// Use the date property if not null
			event.dateString = getDateString(new Date(Date.parse(offsetByTimeZone(event.start.date))));
		} else {
			// Otherwise, set the concert date to TBA
			event.dateString = "TBA";
		}

		// Add displayName and URI properties if they are missing
		if (event.performance.length === 0) {
			event.performance.push({ 
				displayName: event.displayName.split(' at').toString(),
				artist: { uri: "#" }
			});
		}
	});

	//----- USER INTERFACE -----------------------------------
	
	// Iterate over the events array and create a list item for each event
	eventsArray.forEach(function(event) {
		// Create a list item for each event and elements for its contents
		var eventListing = $('<li>').attr('data-event-id', event.id),
			eventName    = $('<h3>').text(event.performance[0].displayName),
			venueName    = $('<h4>').text(event.venue.displayName),
			eventDate    = $('<h5>').text(event.dateString);

		// Append contents to the list item
		eventListing.append(eventName, venueName, eventDate);

		// Append the event list item to its parent container
		$('#event-listings').append(eventListing);
	});

	// Update the event count 
	$('#eventCount').text(`Please select from ${eventsArray.length} upcoming events.`);

	// Paginate the list items
	$('#event-listings').paginathing({
		perPage: 5,
		prevNext: true,
		firstLast: true,
		// custom text for pagination buttons
		prevText: '&laquo;',
		nextText: '&raquo;',
		firstText: 'First',
		lastText: 'Last'
	});

	// Reset the wrapper height to auto computed height
	$('.wrapper').height('auto');

	// Show the event listings
	$('.event-listings-container').fadeIn();

	// Attach event listener to 'submit' user selection
	$('#event-listings li').on('click', function() {

		// Get the event ID from user selection
		var eventId = $(this).data('event-id');

		// Using the event ID, extract the selected event from the events array
		var selectedEvent = eventsArray.filter(function(event) {
			return event.id == eventId; // eventId is type 'string' while event.id is of type 'number'
		})[0];		

		// Hide the event listings
		$('.event-listings-container').fadeOut();

		// Hide the user input section
		$('.user-input').fadeOut();

		// Show the map container -- Do this now so that Leaflet 
		// will have a calculated height for the map container
		$('.search-results').show();

		// Get the list of restaurants around the selected event's venue
		app.getZomatoListings(selectedEvent);
	});
};

// Get a list of restaurants that are near the selected event's coordinates
app.getZomatoListings = function(event) {

	// Venue coordinates
	var lat = event.venue.lat,
		lng = event.venue.lng;		

	$.ajax({
		url: 'https://developers.zomato.com/api/v2.1/geocode',
		method: 'GET',
		dataType: 'json',
		data: {
			apikey: app.zomatoApiKey,
			lat: lat,
			lon: lng
		}
	}).then(function(restaurantsObj) {
		// Create a map that shows the event and surrounding restaurants!!!
		app.mapResults(event, restaurantsObj);
	});
};

app.mapResults = function(event, restaurants) {

	//----- DATA TRANSFORMATION ------------------------------

	// Trim the URIs within the event object
	event.uri = trimURI(event.uri);
	event.performance[0].artist.uri = trimURI(event.performance[0].artist.uri);
	event.venue.uri = trimURI(event.venue.uri);
	event.img = "assets/images/songkick-attribution-assets/sk-badge/sk-badge-pink.svg";

	// What we want is an array of objects, one for each nearby restaurant
	var restaurantsArray  = [],
		nearbyRestaurants = restaurants.nearby_restaurants;

	// Add each restaurant object to the array
	for (var key in nearbyRestaurants) {
		restaurantsArray.push(nearbyRestaurants[key].restaurant);
	}

	// Transform items in the restaurants array
	restaurantsArray.forEach(function(restaurant) {
		// Coerce geographic coordinates to numeric values
		restaurant.location.latitude  = +restaurant.location.latitude;
		restaurant.location.longitude = +restaurant.location.longitude;

		// Use a placeholder image for the restaurant if necessary
		if (!restaurant.hasOwnProperty('thumb') || restaurant.thumb === "") {
			restaurant.thumb = "assets/images/zomato-spoon-logo.svg";
		}
	});

	// Remove restaurants that are missing coordinates
	restaurantsArray = restaurantsArray.filter(function(restaurant) {
		return restaurant.location.latitude !== 0 && restaurant.location.longitude !== 0;
	});

	//----- LEAFLET MAP CONFIGURATION ------------------------

	// Store the venue's coordinates
	var eventLatLng = L.latLng(event.venue.lat, event.venue.lng);

	// Remove any existing map instances
	if (typeof map !== 'undefined') {
		map.remove();
	}

	// Initialize the map
	var map = L.map('results-map');

	// Set the path to the default Leaflet images folder (local installation)
	L.Icon.Default.imagePath = 'assets/images/leaflet';

	// Add a basemap layer
	var Hydda_Full = L.tileLayer('http://{s}.tile.openstreetmap.se/hydda/full/{z}/{x}/{y}.png', {
		attribution: 'Tiles courtesy of <a href="http://openstreetmap.se/" target="_blank">OpenStreetMap Sweden</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
	}).addTo(map);

	// Define alternative basemap layers
	var Esri_WorldImagery = L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
	});

	var CartoDB_Positron = L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
		subdomains: 'abcd',
		maxZoom: 19
	});

	var CartoDB_DarkMatter = L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
		subdomains: 'abcd',
		maxZoom: 19
	});

	// Define a custom marker for the event - red pin
	var eventIcon = L.icon({
		iconAnchor: [12.5, 41], // [1/2 width, height]
		popupAnchor:  [1, -32],
		iconUrl: 'assets/images/leaflet/marker-icon-red.png',
		shadowUrl: 'assets/images/leaflet/marker-shadow.png'
	});

	// Add a marker with a popup for the venue 
	var eventMarker = L.marker(eventLatLng, {
		icon: eventIcon,
		title: event.displayName,
		alt: event.displayName
	}).bindPopup(
		`<div class="popup-container">
			<a class="popup-image-container" href="${event.uri}" target="_blank" title="Event Details">
				<img class="popup-sk-img" src="${event.img}" alt="Songkick Logo">
			</a>
			<div class="popup-info">
				<a class="popup-link" href="${event.uri}" target="_blank" title="Event Details">
					<h2>${event.performance[0].displayName}</h2>
					<p class="date">${event.dateString}</p>
				</a>
				<div>
					<a class="popup-link" href="${event.venue.uri}" target="_blank" title="Venue Details">
						${event.venue.displayName}
					</a>
					<a class="popup-link" href="${event.performance[0].artist.uri}" target="_blank" title="Artist Profile">						
						<img class="artist-icon" src="assets/images/microphone-black.svg" alt="Artist Profile">
					</a>
				</div>
			</div>
		 </div>
		`
	);

	// Initialize an array for all markers to be added to the map
	var markers = [eventMarker];

	// Iterate through the restaurantsArray
	// and create a marker for each restaurant
	restaurantsArray.forEach(function(restaurant) {
		// Get the restaurant's coordinates
		var latLng = L.latLng(restaurant.location.latitude, restaurant.location.longitude);
		// Calculate the distance to the venue (in kilometres)
		var distance = (latLng.distanceTo(eventLatLng) / 1000).toFixed(1);
		var marker = L.marker(latLng, {
			alt: restaurant.name,
			title: restaurant.name
		}).bindPopup(
			`
			<div class="popup-container">
				<a class="popup-image-container" href="${restaurant.url}" target="_blank" title="Restaurant Profile">
					<img class="popup-img" src="${restaurant.thumb}" alt="${restaurant.name}">
				</a>
				<div class="popup-info">
					<a class="popup-link" href="${restaurant.url}" target="_blank" title="Restaurant Profile">
						<h2>${restaurant.name}</h2>
						<p class="cuisine">${restaurant.cuisines}</p>
						<p>${restaurant.location.address}</p>
					</a>					
					<div>
						<span class="distance"><i class="fa fa-location-arrow" aria-hidden="true"></i>${distance} km</span>
						<span class="rating"><i class="fa fa-star" aria-hidden="true"></i>${restaurant.user_rating.aggregate_rating} / 5</span>
						<a class="popup-link" href="${restaurant.menu_url}" target="_blank" title="Menu"><i class="fa fa-cutlery" aria-hidden="true"></i> Menu</a>
					</div>
				</div>
			</div>
			`
		);

		// Add the marker to the marker array
		markers.push(marker);
	});

	// Create a feature group to handle all the markers
	var markerGroup = L.featureGroup(markers);

	// Fit the map to the extent of all markers
	map.fitBounds(markerGroup);

	// Add markers to the map
	markerGroup.addTo(map);

	// Set layers control
	var baseLayers = {
		"Transport" : Hydda_Full,
		"Satellite" : Esri_WorldImagery,
		"Greyscale" : CartoDB_Positron,
		"Dark"      : CartoDB_DarkMatter
	};

	var overlayLayer = {
		"Markers" : markerGroup
	};

	L.control.layers(baseLayers, overlayLayer).addTo(map);

	//--------------------------------------------------------

	// Create a button control to start a new search (reload the page)
	L.Control.ResetButton = L.Control.extend({
	    options: {
	        position: 'bottomright',
	        text: 'Reset',
	        title: ''
	    },
	    onAdd: function () {
	        var container = L.DomUtil.create('div', 'leaflet-reset-button-container');

	        this.button = L.DomUtil.create('button', 'leaflet-reset-button', container);
	        this.button.innerHTML = this.options.text;
	        this.button.title = this.options.title;

	        // Bind the button's click event to its container's
	        L.DomEvent.on(this.button, 'click', this._click, this);

	        return container;
	    },
	    _click: function (e) {
	        L.DomEvent.stopPropagation(e);
	        L.DomEvent.preventDefault(e);
	        location.reload();
	    }
	});

	// Reset button constructor function
	L.resetButton = function( options ) {
		return new L.Control.ResetButton(options);
	};

	// Add the button to the map
	L.resetButton({text: 'New Search', title: 'New Search'}).addTo(map);

	//--------------------------------------------------------

	// Create a Leaflet control to contain the Songkick and Zomato attribution elements
	var apiAttribution = L.control({position: 'bottomleft'});

	apiAttribution.onAdd = function () {
		// Create a container for the attributions and one for each attribution element
		var container = L.DomUtil.create('div', 'attribution-container');
		this.skContainer = L.DomUtil.create('div', 'songkick-attribution', container);
		this.zContainer = L.DomUtil.create('div', 'zomato-attribution', container);
		this.zLogo = L.DomUtil.create('div', 'zomato-logo', this.zContainer);

		// Set dimensions and attributes for attribution elements
		this.skContainer.style.width = 85 + 'px';
		this.skContainer.style.height = 30 + 'px';
		this.skContainer.href = 'http://www.songkick.com';
		this.skContainer.title = 'Songkick';

		this.zContainer.style.width = 30 + 'px';
		this.zContainer.style.height = 30 + 'px';
		this.zContainer.href = 'https://www.zomato.com';
		this.zContainer.title = 'Zomato';;

		this.zLogo.style.width = 38 + 'px';
		this.zLogo.style.height = 9 + 'px';

		/*! Total container width should be 125px */

		// Bind click event methods to attribution containers
		L.DomEvent.on(this.skContainer, 'click', function(e) {
			L.DomEvent.stopPropagation(e);
			L.DomEvent.preventDefault(e);
			window.open(this.skContainer.href, '_blank');
		}, this);

		L.DomEvent.on(this.zContainer, 'click', function(e) {
			L.DomEvent.stopPropagation(e);
			L.DomEvent.preventDefault(e);
			window.open(this.zContainer.href, '_blank');
		}, this);

		return container;
	};

	// Add the attribution container to the map
	apiAttribution.addTo(map);
};

// start the app
$(function() {
	app.init();
});

//---- UTILITY FUNCTIONS -------------------------------------

// Trim superfluous characters from URI (for Songkick listings)
function trimURI(uri) {
	return uri.replace(/"/g,"").split("?")[0];
}

// Return the name of a month from its numeric index
function getMonthName(m) {
    var month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return month[m];
}

// Return a date string in 'Month Date, Year' format
function getDateString(dateObj) {
	var month = getMonthName(dateObj.getMonth()),
		date  = dateObj.getDate(),
		year  = dateObj.getFullYear()
	;
	return `${month} ${date}, ${year}`
}

// Return a date with the local timezone offset
function offsetByTimeZone(dateString) {
	var date = new Date(dateString);
	return new Date( date.getTime() + (date.getTimezoneOffset() * 60000) );
}