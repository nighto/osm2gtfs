// Create an object to hold information for all fetched OSM data
let OSMData = {
    routeMasters: []
}
let GTFSData = {}
let manualData = {}


// Some constants
const OSM_API = 'https://www.openstreetmap.org/api/0.6'
const DEBUG = true
const MOCK = true
const DEFAULT_START_DATE = '19000101'
const DEFAULT_END_DATE = '20991231'

// Temporary variables (will be filled by user later)
const AGENCY_URL = 'http://www.cbtu.gov.br/'
const AGENCY_TIMEZONE = 'America/Recife'

/**
 * Debugs OSM data, printing information on screen.
 * @param {Object} OSMData
 */
const debugOSMData = OSMData => {
    let debug = ``
    if (OSMData.routeMasters && OSMData.routeMasters.length > 0) {
        OSMData.routeMasters.forEach(routeMaster => {
            if (routeMaster.id) {
                debug += `- Route Master: id ${routeMaster.id}\n`
                debug += `  Name: ${routeMaster.tags.filter(tag => tag.k === 'name')[0].v}\n`
                routeMaster.members.forEach(route => {
                    if (route.data && route.data.id) {
                        debug += `\t- Route: id ${route.data.id}\n`
                        debug += `\t  Name: ${route.data.tags.filter(tag => tag.k === 'name')[0].v}\n`
                        let stopsWithData = route.data.members.filter(node => node.role === 'stop' && node.data).length
                        debug += `\t\t- Stops with data: ${stopsWithData}\n`
                        let stopsWithoutData = route.data.members.filter(node => node.role === 'stop' && !node.data).length
                        debug += `\t\t- Stops without data: ${stopsWithoutData}\n`
                        let waysWithData = route.data.members.filter(way => way.type === 'way' && way.data && way.data.nds.filter(nd => nd.data)).length
                        debug += `\t\t- Ways with data: ${waysWithData}\n`
                        let waysWithoutData = route.data.members.filter(way => way.type === 'way' && (!way.data || way.data.nds.filter(nd => nd.data).length === 0)).length
                        debug += `\t\t- Ways without data: ${waysWithoutData}\n`
                    }
                })
            }
        })
    } else {
        debug = 'Not yet initialized.'
    }
    document.querySelector('pre').textContent = debug
}

/**
 * Fetch OSM data for a route master id
 * @param {Number} id A Route Master relation ID
 */
const fetchRouteMaster = async id => {
    let routeMasterData = await fetchOSMData('relation', id)
    OSMData.routeMasters.push(routeMasterData)
    console.log(OSMData)
}

/**
 * Async function to get data from OSM API
 * @param {String} type OSM data type (node, way or relation)
 * @param {Number} id OpenStreetMap object ID
 */
const fetchOSMData = async (type, id) => {
    let url = `${OSM_API}/${type}/${id}`
    console.log('Fetching ' + url)
    let response = await fetch(url)
    let data = await response.text()
    return await parseOSMData(type, data)
}

/**
 * Parse data from OSM API
 * @param {String} type OSM data type (node, way or relation)
 * @param {String} xmlText A XML string returned by OSM API
 */
const parseOSMData = async (type, xmlText) => {
    let parser = new DOMParser()
    let doc = parser.parseFromString(xmlText, 'application/xml')
    // reading directly node/way/relation inside of <osm> because root element doesn't matter.
    let thisNode = doc.querySelector(type)
    let attributes = readNodeAttributes(thisNode)
    
    // read children XML nodes: tag, nd, member
    let tagsList = readNodeDescendentsNamed(thisNode, 'tag')
    if (tagsList.length) {
        attributes.tags = tagsList
    }
    let ndsList = readNodeDescendentsNamed(thisNode, 'nd')
    if (ndsList.length) {
        attributes.nds = ndsList
        attributes.nds.forEach(async nd => {
            nd.data = await fetchOSMData('node', nd.ref)
        })
    }
    let membersList = readNodeDescendentsNamed(thisNode, 'member')
    if (membersList.length) {
        attributes.members = membersList
        attributes.members.forEach(async member => {
            member.data = await fetchOSMData(member.type, member.ref)
        })
    }
    return attributes
}

/**
 * Read XMLNode attributes and return an object with all values - <tag k="v"/> => {k:"v"}
 * @param {XMLNode} node A XML Node to be processed
 */
const readNodeAttributes = node => {
    let obj = {}
    let nodeAttributesLength = node.attributes.length
    for (let i=0; i<nodeAttributesLength; i++) {
        let key = node.attributes.item(i).name
        let value = node.attributes.item(i).value
        obj[key] = value
    }
    return obj
}

/**
 * Read XMLNode descendants and return an array with all values - <tag k1="v1"><tag k2="v2"> => [{k1:"v1", k2:"v2"}]
 * @param {XMLNode} node A XML Node to be processed
 * @param {String} name The descendants that you want to process
 */
const readNodeDescendentsNamed = (node, name) => {
    let descendentNodes = node.querySelectorAll(name)
    let descendentList = []
    descendentNodes.forEach(descendentNode => descendentList.push(readNodeAttributes(descendentNode)))
    return descendentList
}

/**
 * Simple function to call API to fetch each route master ID entered by user
 */
const readRouteMasters = () => {
    let routeMastersIDs = document.querySelector('#routemasters').value.split("\n")
    routeMastersIDs.forEach(routeMasterID => {
        fetchRouteMaster(routeMasterID)
    })
}

/**
 * Prepares manual input fields so user can enter information not available on OSM
 */
const prepareManualInputs = () => {
    // Agencies
    manualData.agencies = []
    let agencyManual = ''
    OSMData.routeMasters.forEach(routeMaster => {
        // Agency
        // start by reading operator tags
        let operatorArray = routeMaster.tags.filter(tag => tag.k === 'operator')
        if (operatorArray.length) {
            // OSM tags are unique, so if there are more than one, there's only one, we can read [0] directly instead of looping.
            let operator = operatorArray[0].v
            // if we don't have it on our array already
            if (manualData.agencies.filter(agency => agency.agency_name === operator).length === 0) {
                manualData.agencies.push({
                    agency_name: operator,
                })
            }
        }
    })
    agencyManual += `<table class="table">
        <thead>
            <tr>
                <th>Operator</th>
                <th>URL</th>
                <th>Timezone</th>
            </tr>
        </thead>
        <tbody>`
    manualData.agencies.forEach((agency, index) => {
        agencyManual += `<tr>
            <td>${agency.agency_name}</td>
            <td><input id="agency${index}_url" value="${AGENCY_URL}" class="form-control"></td>
            <td><input id="agency${index}_timezone" value="${AGENCY_TIMEZONE}" class="form-control"></td>
        </tr>`
    })
    agencyManual += `</tbody></table>`

    document.querySelector('#agency_manual').innerHTML = agencyManual

    // Routes
    manualData.routes = []
    let routeCalendarManual = `<table class="table">
        <thead>
            <tr>
                <th>Route</th>
                <th>Calendar</th>
                <th>Departures</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
    `
    
    OSMData.routeMasters.forEach(routeMaster => {
        routeMaster.members.forEach(route => {
            console.log(route)
            let name = ''
            let tagName = route.data.tags.filter(tag => tag.k === 'name')
            let index = manualData.routes.length
            if (tagName.length) {
                name = tagName[0].v
            }
            routeCalendarManual += `<tr id="routeCalendar${index}">
                <td>${name}</td>
                <td id="route${index}_calendar" class="routeCalendar"><div>${writeCalendarInput(index, 0)}</div></td>
                <td id="route${index}_departures"><div>${writeDeparturesInput(index, 0)}</div></td>
                <td id="route${index}_start_date"><input id="route${index}_start_date_input" class="form-control" placeholder="YYYYMMDD, blank if unknown"></td>
                <td id="route${index}_end_date"><input id="route${index}_end_date_input" class="form-control" placeholder="YYYYMMDD, blank if not defined"></td>
                <td>
                    <button onclick="duplicateRouteCalendar(${index})">➕</button>
                </td>
            </tr>`
            manualData.routes.push(route)
        })
    })

    routeCalendarManual += `</tbody></table>`
    document.querySelector('#route_calendar_manual').innerHTML = routeCalendarManual
}

/**
 * Creates a list of inputs for each calendar week day.
 * @param {number} routeIndex The route index number on routes array
 * @param {number} calendarIndex The calendar index number on calendars array
 */
const writeCalendarInput = (routeIndex, calendarIndex) => {
    return `<input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_monday">M
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_tuesday">T
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_wednesday">W
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_thursday">T
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_friday">F
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_saturday">S
    <input type="checkbox" id="route${routeIndex}_calendar${calendarIndex}_sunday">S`
}

/**
 * Writes a text input so user can enter the departures values.
 * @param {number} routeIndex The route index number on routes array
 * @param {number} departureIndex The departure index number on departures array
 */
const writeDeparturesInput = (routeIndex, departureIndex) => {
    return `<input id="route${routeIndex}_departures${departureIndex}_input" class="form-control">`
}

/**
 * Create a new route calendar entry on DOM, so user can enter multiple calendars for the same route.
 * @param {number} routeIndex The route index number on routes array
 */
const duplicateRouteCalendar = routeIndex => {
    let calendarCell = document.querySelector(`#route${routeIndex}_calendar`)
    let departuresCell = document.querySelector(`#route${routeIndex}_departures`)
    let count = calendarCell.childElementCount

    let newCalendar = document.createElement('div')
    let newDepartures = document.createElement('div')
    newCalendar.innerHTML = writeCalendarInput(routeIndex, count)
    newDepartures.innerHTML = writeDeparturesInput(routeIndex, count)

    calendarCell.appendChild(newCalendar)
    departuresCell.appendChild(newDepartures)
}

/**
 * Splits departures string into an array of individual departures
 * @param {string} departures Departures string, such as "12:00 13:00 14:00-18:00/30"
 * @return {string[]} array of individual departures (already processing intervals) in hh:mm:ss format
 */
const processDepartures = departures => {
    let processedArray = []
    // removes :, and process each element
    departures.replace(/\:/g, '').split(' ').forEach(departure => {
        // putting them all on processedArray
        processedArray = processedArray.concat(processDeparture(departure))
    })
    // finally, we need to deduplicate departures
    return [...new Set(processedArray)]
}

/**
 * Handles departure, calculating individual departures from a interval based departure
 * @param {string} departure A departure string, such as "14:00" or "15:00-16:00/30"
 * @return {string[]} an array of interval strings in the hh:mm:ss format
 */
const processDeparture = departure => {
    if (departure.toString().indexOf('-') === -1 && departure.toString().indexOf('/') === -1) {
        return [processSingleDeparture(departure)]
    }
    let departureBits = departure.split(/[\-\/]/) // first begin, second end, third interval
    let time = []
    let beginArray = processSingleDeparture(departureBits[0]).split(':')
    let endArray = processSingleDeparture(departureBits[1]).split(':')
    let interval = parseInt(departureBits[2], 10)

    let beginTime = new Date()
    beginTime.setHours(beginArray[0])
    beginTime.setMinutes(beginArray[1])
    beginTime.setSeconds(beginArray[2])
    beginTime.setMilliseconds(0)
    let current = new Date() // current of equal value of begin
    current.setHours(beginArray[0])
    current.setMinutes(beginArray[1])
    current.setSeconds(beginArray[2])
    current.setMilliseconds(0)
    let endTime = new Date()
    endTime.setHours(endArray[0])
    endTime.setMinutes(endArray[1])
    endTime.setSeconds(endArray[2])
    endTime.setMilliseconds(0)

    do {
        time.push(`${getPaddedHours(current, beginTime)}:${getPaddedMinutes(current)}:${getPaddedSeconds(current)}`)
        current.setMinutes(current.getMinutes() + interval)
    } while (current <= endTime)
    return time
}

/**
 * Returns the departure hour as a padded string, such as "01"
 * @param {DateTime} date a DateTime to return the hour
 * @param {DateTime} beginDate the interval begin DateTime, to make for instance 1 AM in the next day as "25"
 * @return {string} departure hour, padded with zero, such as "02"
 */
const getPaddedHours = (date, beginDate) => {
    let beginDay = beginDate.getDate()
    let currentDay = date.getDate()
    if (beginDay === currentDay) {
        return getPaddedNumber(date.getHours())
    }
    return getPaddedNumber(date.getHours() + 24 * (currentDay - beginDay))
}

/**
 * Returns the departure minute as a padded string, such as "00"
 * @param {DateTime} date a DateTime to return the minute
 * @return {string} the departure minute as a padded string, such as "00"
 */
const getPaddedMinutes = date => {
    return getPaddedNumber(date.getMinutes())
}

/**
 * Returns the departure second as a padded string, such as "00"
 * @param {DateTime} date a DateTime to return the second
 * @return {string} the departure second as a padded string, such as "00"
 */
const getPaddedSeconds = date => {
    return getPaddedNumber(date.getSeconds())
}

/**
 * Returns a number padded, such as 0 => "00"
 * @param {(string|number)} num Number to be padded
 * @return {string} padded number
 */
const getPaddedNumber = num => {
    return num.toString().padStart(2,'0')
}

/**
 * Returns the departure as a hh:mm:ss string
 * @param {string|number} departure A departure on the hhmm or hhmmss format
 * @return {string} the departure on hh:mm:ss format
 */
const processSingleDeparture = departure => {
    if (departure.toString().length <= 4) {
        return `${departure.toString().padStart(4, '0').substr(0,2)}:${departure.toString().substr(-2)}:00`
    }
    return `${departure.toString().padStart(6, '0').substr(0,2)}:${departure.toString().substr(-4, 2)}:${departure.toString().substr(-2)}`
}

/**
 * Reads OSM and manual data and process it into a GTFS object - which will be later converted into a set of CSVs
 */
const convertToGTFS = () => {
    let agencies = []
    let calendars = []
    let shapes = []
    let stops = []
    let routes = []

    // first, process manual data
    // Agencies
    manualData.agencies.forEach(agency => {
        agencies.push({
            agency_name: manualData.agencies[agencies.length].agency_name,
            agency_url: document.querySelector(`#agency${agencies.length}_url`).value,
            agency_timezone: document.querySelector(`#agency${agencies.length}_timezone`).value,
        })
    })

    // Calendars
    manualData.routes.forEach((route, routeIndex) => {
        let calendarCount = document.querySelector(`#route${routeIndex}_calendar`).childElementCount
        for (let calendarIndex=0; calendarIndex<calendarCount; calendarIndex++) {
            calendars.push({
                service_id: `${route.ref}_${calendarIndex}`,
                monday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_monday`).checked ? 1 : 0,
                tuesday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_tuesday`).checked ? 1 : 0,
                wednesday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_wednesday`).checked ? 1 : 0,
                thursday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_thursday`).checked ? 1 : 0,
                friday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_friday`).checked ? 1 : 0,
                saturday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_saturday`).checked ? 1 : 0,
                sunday: document.querySelector(`#route${routeIndex}_calendar${calendarIndex}_sunday`).checked ? 1 : 0,
                start_date: document.querySelector(`#route${routeIndex}_start_date_input`).value || DEFAULT_START_DATE,
                end_date: document.querySelector(`#route${routeIndex}_end_date_input`).value || DEFAULT_END_DATE,
            })
        }
    })

    // for every routemaster we have
    OSMData.routeMasters.forEach(routeMaster => {
        // Routes
        // (GTFS Routes are based on OSM routemaster (eg. L1) information, not on OSM route (eg. L1 A->B) information.)
        let route_type
        let routeTypeArray = routeMaster.tags.filter(tag => tag.k === 'route_master')
        if (routeTypeArray.length) {
            // test route_types
            switch(routeTypeArray[0].v) {
                case 'subway':
                    route_type = 1
                    break
                default:
                    route_type = 0 // route_type has no default value, setting first one so it doesn't fail
            }
        }
        routes.push({
            route_id: routeMaster.id,
            route_short_name: readTagValue(routeMaster.tags, 'name'),
            route_long_name: readTagValue(routeMaster.tags, 'ref'),
            route_type,
            route_color: readTagValue(routeMaster.tags, 'colour') // notice OSM uses British English, i.e. "colour" instead of "color"
        })
        // Known bug / limitation:
        // 2) route_color is an optional attribute, so if no routes have it, we should erase this attribute

        // for every route in route master
        routeMaster.members.forEach(route => {
            // Stops
            // for every stop in route
            route.data.members.filter(routeMember => routeMember.role === 'stop').forEach(stop => {
                stops.push({
                    stop_id: stop.ref,
                    stop_name: readTagValue(stop.data.tags, 'name'),
                    stop_lat: stop.data.lat,
                    stop_lon: stop.data.lon,
                })
                // Known bugs / limitations:
                // 3) doesn't check for stop existence (would duplicate same stop if used by two or more different lines)
                // 4) doesn't check for similar stop existence (GTFS allows to group two stops into a single station, but that's optional)
            })

            // Shapes
            // for every way in route
            let shapeSequence = 1
            let shape = []
            route.data.members.filter(routeMember => routeMember.type === 'way').forEach(way => {
                // for every node in way
                way.data.nds.forEach(node => {
                    shape.push({
                        shape_id: route.ref,
                        shape_pt_lat: node.data.lat,
                        shape_pt_lon: node.data.lon,
                        shape_pt_sequence: shapeSequence++
                    })
                })
            })
            // now we have to deduplicate points, as each way would have their end node being the same as next way start point
            let uniqueShape = uniqByWithoutSequence(shape, JSON.stringify)
            // finally, append to shapes array
            shapes = shapes.concat(uniqueShape)
        })
    })

    GTFSData = {
        agencies,
        calendars,
        shapes,
        stops,
        routes,
    }
    console.log(GTFSData)
    processGTFS()
}

/**
 * 
 * @param {Array} arr Array to be filtered
 * @param {Function} key Function to apply to each Array element, for instance JSON.stringify
 */
const uniqByWithoutSequence = (arr, key) => {
    let seen = {}
    return arr.filter(item => {
        let itemWithoutId = JSON.parse(JSON.stringify(item))
        delete itemWithoutId.shape_pt_sequence
        let k = key(itemWithoutId)
        return seen.hasOwnProperty(k) ? false : (seen[k] = true)
    })
}

/**
 * Reads a tag value if it exists on OSM data, otherwise return empty string
 * @param {Object[]} tags Tags array that you want to search
 * @param {String} tags[].k Key name
 * @param {String} tags[].v Key value
 * @param {String} keyName the key you want to return its value
 */
const readTagValue = (tags, keyName) => {
    let filteredTagArray = tags.filter(tag => tag.k === keyName)
    if (filteredTagArray.length) {
        return filteredTagArray[0].v // tags can't repeat, if found it will be the 1st element
    }
    return ''
}

/**
 * Reads the GTFSData object and converts it to CSV
 */
const processGTFS = () => {
    // Agencies
    let agenciesCSV = writeCSVString(GTFSData.agencies)
    debugGTFS('agency', agenciesCSV)
    // Stops
    let stopsCSV = writeCSVString(GTFSData.stops)
    debugGTFS('stops', stopsCSV)
    // Routes
    let routesCSV = writeCSVString(GTFSData.routes)
    debugGTFS('routes', routesCSV)
    // Shapes
    let shapesCSV = writeCSVString(GTFSData.shapes)
    debugGTFS('shapes', shapesCSV)
    // Calendar
    let calendarCSV = writeCSVString(GTFSData.calendars)
    debugGTFS('calendar', calendarCSV)
}

/**
 * Writes a CSV string based on a generic objects' array
 * @param {Object[]} data Array of GTFS objects
 */
const writeCSVString = data => {
    let csvLinesArray = []
    // test if there's at least one element in array
    if (data.length) {
        // read params from first item
        csvLinesArray.push(Object.keys(data[0]).join(','))
        // then read each object
        data.forEach(obj => {
            csvLinesArray.push(Object.values(obj).join(','))
        })
    }
    // finally, returns array as a single string with a line-break between each line
    return csvLinesArray.join('\n')
}

/**
 * Prints GTFS CSV debug if needed
 * @param {String} elementId name of HTML element to write CSV into
 * @param {String} data CSV data to write
 */
const debugGTFS = (elementId, data) => {
    if (DEBUG) {
        let element = document.querySelector('#' + elementId)
        element.innerHTML = data
    }
}

// Attach button event
document.querySelector('#fetch').onclick = readRouteMasters
document.querySelector('#prepareManual').onclick = prepareManualInputs
document.querySelector('#convert').onclick = convertToGTFS

// Fires debug
if (DEBUG) {
    setInterval(() => { debugOSMData(OSMData) }, 100)
}

// Gets mock data
if (MOCK) {
    const getMockData = async () => {
        let response = await fetch('mock.json')
        let data = await response.text()
        OSMData = JSON.parse(data)
        console.log(OSMData)
    }
    getMockData()
}