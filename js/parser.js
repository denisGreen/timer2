/*
Copyright (c) <2015>, Intel Corporation All Rights Reserved.
 
The source code, information and material ("Material") contained herein is owned by Intel Corporation 
or its suppliers or licensors, and title to such Material remains with Intel Corporation or its 
suppliers or licensors. The Material contains proprietary information of Intel or its suppliers 
and licensors. The Material is protected by worldwide copyright laws and treaty provisions. No part of 
the Material may be used, copied, reproduced, modified, published, uploaded, posted, transmitted, 
distributed or disclosed in any way without Intel's prior express written permission. 
No license under any patent, copyright or other intellectual property rights in the Material is granted 
to or conferred upon you, either expressly, by implication, inducement, estoppel or otherwise. Any 
license under such intellectual property rights must be express and approved by Intel in writing.
 
Copyright (c) Microsoft Corporation. All rights reserved
 
Unless otherwise agreed by Intel in writing, you may not remove or alter this notice or any other 
notice embedded in Materials by Intel or Intels suppliers or licensors in any way.
*/
 
// Overview
//    - Read in RealSense XDM image, parse it and get XMP data into XML file,
//      and extract depth and RGB image data
// Input
//    - XDM JPG image 
// Outputs
//    - XML file with metadata under XMP
//    - XML file with metadata under XAP
//    - Color image(s) - JPEG
//    - Depth map image - PNG
// Usage
//    node ./xdm_js_parser.js xdmJpgFile
// Prerequisites
//    - nodejs + npm https://nodejs.org/
//    - fs package https://nodejs.org/api/fs.html
//    - sax package https://www.npmjs.com/package/sax
//    - atob package https://www.npmjs.com/package/atob

var fs = require('fs');
var sax = require('sax');
var atob = require('atob');

// Adobe XMP APP1 specifier
var marker1 = 0xFF;
var marker2 = 0xE1;
// Adobe XMP namespace URIs
// StandardXMP
var header1 = "http://ns.adobe.com/xap/1.0/";
// ExtendedXMP
var header2 = "http://ns.adobe.com/xmp/extension/";
var noHeader = "";

// Input and output files
var inputJpgFile = process.argv[2];
var outputXMPFile = outputXMPFileName(inputJpgFile);
var outputXAPFile = outputXAPFileName(inputJpgFile);

// XDM file name is abc.jpg and XML/XMP file name is abc_xmp.xml
function outputXMPFileName(inputXDMFileName) {
    return (inputXDMFileName.substring(0, inputXDMFileName.length - 4) + "_xmp.xml");
}

// XDM file name is abc.jpg and XML/XAP file name is abc_xap.xml
function outputXAPFileName(inputXDMFileName) {
    return (inputXDMFileName.substring(0, inputXDMFileName.length - 4) + "_xap.xml");
}

// Return buffer index that contains marker 0xFFE1 from buffer[position]
// If not found, return -1
function findMarker(buffer, position) {
    var index;
    for (index = position; index < buffer.length; index++) {
        if ((buffer[index] == marker1) && (buffer[index + 1] == marker2))
            return index;
    }
    return -1;
}

// Return header/namespace if found; return "" if not found
function findHeader(buffer, position) {
    var string1 = buffer.toString('ascii', position + 4, position + 4 + header1.length);
    var string2 = buffer.toString('ascii', position + 4, position + 4 + header2.length);
    if (string1 == header1)
        return header1;
    else if (string2 == header2)
        return header2;
    else
        return noHeader;
}

// Return GUID position
function findGUID(buffer, position, size) {
    var string = buffer.toString('ascii', position, position + size - 1);
    var xmpNoteString = "xmpNote:HasExtendedXMP=";
    var GUIDPosition = string.search(xmpNoteString);
    var returnPos = GUIDPosition + position + xmpNoteString.length + 1;
    return returnPos;
}

// Main function to parse XDM file
function xdmParser(xdmFilePath) {
	try {
	    //Get JPEG file size in bytes
	    var fileStats = fs.statSync(xdmFilePath);
	    var fileSizeInBytes = fileStats["size"];

	    var fileBuffer = new Buffer(fileSizeInBytes);

        //Get JPEG file descriptor
	    var xdmFileFD = fs.openSync(xdmFilePath, 'r');

	    //Read JPEG file into a buffer (binary)
	    fs.readSync(xdmFileFD, fileBuffer, 0, fileSizeInBytes, 0);

	    var bufferIndex, segIndex = 0, segDataTotalLength = 0, XMLTotalLength = 0;
	    for (bufferIndex = 0; bufferIndex < fileBuffer.length; bufferIndex++) {
	        var markerIndex = findMarker(fileBuffer, bufferIndex);
	        if (markerIndex != -1) {
                // 0xFFE1 marker is found
	            var segHeader = findHeader(fileBuffer, markerIndex);
	            if (segHeader) {
	                // Header is found
	                // If no header is found, go find the next 0xFFE1 marker and skip this one
                    // segIndex starts from 0, NOT 1
	                var segSize = fileBuffer[markerIndex + 2] * 16 * 16 + fileBuffer[markerIndex + 3];
	                var segDataStart;

	                // 2-->segSize is 2-byte long
                    // 1-->account for the last 0 at the end of header, one byte
	                segSize -= (segHeader.length + 2 + 1);
	                // 2-->0xFFE1 is 2-byte long
	                // 2-->segSize is 2-byte long
	                // 1-->account for the last 0 at the end of header, one byte
	                segDataStart = markerIndex + segHeader.length + 2 + 2 + 1;
	               
	                if (segHeader == header1) {
                        // StandardXMP
	                    var GUIDPos = findGUID(fileBuffer, segDataStart, segSize);
	                    var GUID = fileBuffer.toString('ascii', GUIDPos, GUIDPos + 32);
	                    var segData_xap = new Buffer(segSize - 54);
	                    fileBuffer.copy(segData_xap, 0, segDataStart + 54, segDataStart + segSize);
	                    fs.appendFileSync(outputXAPFile, segData_xap);
	                }
	                else if (segHeader == header2) {
                        // ExtendedXMP
	                    var segData = new Buffer(segSize - 40);
	                    fileBuffer.copy(segData, 0, segDataStart + 40, segDataStart + segSize);
	                    XMLTotalLength += (segSize - 40);
	                    fs.appendFileSync(outputXMPFile, segData);
	                }
	                bufferIndex = markerIndex + segSize;
	                segIndex++;
	                segDataTotalLength += segSize;
	            }
	        }
	        else {
                // No more marker can be found. Stop the loop
	            break;
	        };
	    }
	} catch(ex) {
		console.log("Something bad happened! " + ex);
	}
}

console.log("Parse XDM file" + inputJpgFile + "...");
xdmParser(inputJpgFile);

var parser;

// Parse XMP metadata and search attribute names for color image and depth map
function xmpMetadataParser() {
    var imageIndex = 0, depthImageIndex = 0, outputPath = "";
    parser = sax.parser();

    // Extract data when specific data attributes are encountered
    parser.onattribute = function (attr) {
        if ((attr.name == "IMAGE:DATA") || (attr.name == "GIMAGE:DATA")) {
            outputPath = inputJpgFile.substring(0, inputJpgFile.length - 4) + "_" + imageIndex + ".jpg";
            var atob = require('atob'), b64 = attr.value, bin = atob(b64);
            fs.writeFileSync(outputPath, bin, 'binary');
            imageIndex++;
        } else if ((attr.name == "DEPTHMAP:DATA") || (attr.name == "GDEPTH:DATA")) {
            outputPath = inputJpgFile.substring(0, inputJpgFile.length - 4) + "_depth_" + depthImageIndex + ".png";
            var atob = require('atob'), b64 = attr.value, bin = atob(b64);
            fs.writeFileSync(outputPath, bin, 'binary');
            depthImageIndex++;
        }
    };

    parser.onend = function () {
        console.log("All done!")
    }
}

// Process XMP metadata
function processXmpData(filePath) {
    try {
        var file_buf = fs.readFileSync(filePath);
        parser.write(file_buf.toString('utf8')).close();
    } catch (ex) {
        console.log("Something bad happened! " + ex);
    }
}

xmpMetadataParser();
processXmpData("%PUBLIC_URL%/img/IMG_20171203_114734.jpg");