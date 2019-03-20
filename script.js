// Create an object to hold information for all fetched OSM data
let OSMData = {
    routeMasters: []
}
let GTFSData = {}


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
                    agency_url: AGENCY_URL,
                    agency_timezone: AGENCY_TIMEZONE
                })
            }
        }
    })
    GTFSData.agencies = agencies
    console.log(GTFSData)
    processGTFS()
}

/**
 * Reads the GTFSData object and converts it to CSV
 */
const processGTFS = () => {
    // Agencies
    let agenciesCSV = ''
    if (GTFSData.agencies.length) {
        // read params from first item
        agenciesCSV += Object.keys(GTFSData.agencies[0]).join(',') + '\n'
        // then read agencies
        GTFSData.agencies.forEach(agency => {
            agenciesCSV += Object.values(agency).join(',') + '\n'
        })
    }
    console.log('agency.txt')
    console.log(agenciesCSV)
}

// Attach button event
document.querySelector('#fetch').onclick = readRouteMasters
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