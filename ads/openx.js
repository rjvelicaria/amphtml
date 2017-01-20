/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {loadScript, writeScript, validateData} from '../3p/3p';
import {doubleclick} from '../ads/google/doubleclick';

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Sort of like Object.assign.
 * @param {!Object} target
 * @param {!Object} source
 * @return {!Object}
 */
function assign(target, source) {
  for (const prop in source) {
    if (hasOwnProperty.call(source, prop)) {
      target[prop] = source[prop];
    }
  }

  return target;
}

/* global OX: false */

/**
 * @param {!Window} global
 * @param {!Object} data
 */
export function openx(global, data) {
  const openxData = ['host', 'nc', 'auid', 'dfpSlot', 'dfp'];
  const dfpData = assign({}, data); // Make a copy for dfp.
  const DEBUG_MODE = true; //global.location.href.indexOf('OX_DEBUG=1') !== -1;
  const DEBUG_HOST = 'qa-v2-i63-auto-pmp.del-qa.openx.net';

  // TODO: check mandatory fields
  validateData(data, [], openxData);
  // Consolidate Doubleclick inputs for forwarding -
  // conversion rules are explained in openx.md.
  if (data.dfpSlot) {
    // Anything starting with 'dfp' gets promoted.
    openxData.forEach(openxKey => {
      if (openxKey in dfpData && openxKey !== 'dfp') {
        if (openxKey.indexOf('dfp') === 0) {
          // Remove 'dfp' prefix, lowercase the first letter.
          let fixKey = openxKey.substring(3);
          fixKey = fixKey.substring(0,1).toLowerCase() + fixKey.substring(1);
          dfpData[fixKey] = data[openxKey];
        }
        delete dfpData[openxKey];
      }
    });

    // Promote the whole 'dfp' object.
    if ('dfp' in data) {
      assign(dfpData, dfpData.dfp);
      delete dfpData['dfp'];
    }
  }

  // Decide how to render.
  if (data.host) {
    let jssdk = `https://${data.host}/mw/1.0/jstag?hbv=2.0&dbg=1`;
    if (DEBUG_MODE) {
      jssdk = `http://${data.host}/jstag?dbg=1`;
    }

    global.OX_cmds = global.OX_cmds || [];
      global.OX_cmds.push(function(){
        if (OX) {
          console.debug(`OXHBConfig ox_cmds push`, global, global.OXHBConfig);
          global.OXHBConfig = global.OXHBConfig || {
            _bidderConfiguration: 'hb_2amp',
            ad_position_detection_enabled: true,
            host: DEBUG_MODE ? DEBUG_HOST : data.host,
            medium: 'mw',
            oxns: 'OX',
            siteName: global.location.ancestorOrigins[0]
          };
          DEBUG_MODE && OX.setGateway('qa-v2-i63-auto-pmp.del-qa.openx.net/mw');
        }
      });
    if (data.nc && data.dfpSlot) { // Use DFP Bidder
      jssdk += '&nc=' + encodeURIComponent(data.nc);

      global.OX_dfp_ads = [
        [
          data.dfpSlot,
          [data.width + 'x' + data.height],
          'c'
        ]
      ];
      global.doubleclick = doubleclick;
      global.oxDone = () => {
        console.debug(`OX Done!!!`, dfpData, global);
        doubleclick(global, dfpData);
      }
      dfpData.targeting = Object.assign({
          get oxb() {
            var priceMap = global.oxhbjs && global.oxhbjs.getPriceMap();
            if (priceMap) {
              return priceMap['c'].size + '_' + priceMap['c'].price + ',hb-bid-' + priceMap['c'].bid_id;
            }
            return 'none_t'

          }
        }, dfpData.targeting || {});
      global.dfpData = dfpData;

      writeScript(global, jssdk, () => {
        /*eslint "google-camelcase/google-camelcase": 0*/
        /**
         * Local Dev Mode Patch start here
         */
        writeScript(global, 'http://localhost:9000/dist/hb-sdk.js', () => {
          console.debug(`OXHBConfig hb-sdk load`, global.OXHBConfig);
        });
        /**
         * Local Dev Mode Patch end here
         */
        // OX._requestArgs['amp'] = 1;
        // doubleclick(global, dfpData);
      });
    } else if (data.auid) { // Just show an ad.
      global.OX_cmds = [
        () => {
          const oxRequest = OX();
          const oxAnchor = global.document.createElement('div');
          global.document.body.appendChild(oxAnchor);
          /*eslint "google-camelcase/google-camelcase": 0*/
          OX._requestArgs['amp'] = 1;
          oxRequest.addAdUnit(data.auid);
          oxRequest.setAdSizes([data.width + 'x' + data.height]);
          oxRequest.getOrCreateAdUnit(data.auid).set('anchor', oxAnchor);
          oxRequest.load();
        },
      ];
      loadScript(global, jssdk);
    }
  } else if (data.dfpSlot) { // Fall back to a DFP ad.
    doubleclick(global, dfpData);
  }
}
