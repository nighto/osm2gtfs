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
 * Reads OSM Data and process it into a GTFS object - which will be later converted into a set of CSVs
 */
const convertToGTFS = () => {
    let agencies = []
    let stops = []
    let routes = []
    let shapes = []
    // for every routemaster we have
    OSMData.routeMasters.forEach(routeMaster => {
        // Agency
        // start by reading operator tags
        let operatorArray = routeMaster.tags.filter(tag => tag.k === 'operator')
        if (operatorArray.length) {
            // OSM tags are unique, so if there are more than one, there's only one, we can read [0] directly instead of looping.
            let operator = operatorArray[0].v
            // if we don't have it on our array already
            if (agencies.filter(agency => agency.agency_name === operator).length === 0) {
                agencies.push({
                    agency_name: operator,
                    agency_url: document.querySelector(`#agency${agencies.length}_url`).value,
                    agency_timezone: document.querySelector(`#agency${agencies.length}_timezone`).value,
                })
            }
        }

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
    GTFSData.agencies = agencies
    GTFSData.stops = stops
    GTFSData.routes = routes
    GTFSData.shapes = shapes
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

const prepareManualInputs = () => {
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
    agencyManual += `<table>
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
            <td><input id="agency${index}_url" value="${AGENCY_URL}"></td>
            <td><input id="agency${index}_timezone" value="${AGENCY_TIMEZONE}"></td>
        </tr>`
    })
    agencyManual += `</tbody></table>`

    document.querySelector('#agency_manual').innerHTML = agencyManual
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