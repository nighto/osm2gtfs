// Create an object to hold information for all fetched OSM data
let OSMData = {
    routeMasters: []
}

// Some constants
const OSM_API = 'https://www.openstreetmap.org/api/0.6'

// Fetch OSM data for a route master id
const fetchRouteMaster = async id => {
    routeMasterData = await fetchOSMData('relation', id)
    OSMData.routeMasters.push(routeMasterData)
    console.log(OSMData)
}

// Async function to get data from OSM API
const fetchOSMData = async (type, id) => {
    let url = `${OSM_API}/${type}/${id}`
    console.log('Fetching ' + url)
    let response = await fetch(url)
    let data = await response.text()
    return parseOSMData(type, data)
}

// Parse data from OSM API
const parseOSMData = (type, xmlText) => {
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
    }
    let membersList = readNodeDescendentsNamed(thisNode, 'member')
    if (membersList.length) {
        attributes.members = membersList
    }
    return attributes
}

// returns an object with all values
// <tag k="v"/> => {k:"v"}
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

// returns an array of named descendents with all values
// <tag k1="v1"><tag k2="v2"> => [{k1:"v1", k2:"v2"}]
const readNodeDescendentsNamed = (node, name) => {
    let descendentNodes = node.querySelectorAll(name)
    let descendentList = []
    descendentNodes.forEach(descendentNode => descendentList.push(readNodeAttributes(descendentNode)))
    return descendentList
}

// Simple function to call API to fetch each route master ID entered by user
const readRouteMasters = () => {
    let routeMastersIDs = document.querySelector('#routemasters').value.split("\n")
    routeMastersIDs.forEach(routeMasterID => {
        fetchRouteMaster(routeMasterID)
    })
}

// Attach button event
document.querySelector('#process').onclick = readRouteMasters
