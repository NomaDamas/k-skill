# emergency-room-beds

Nearby Korean emergency-room lookup backed by E-Gen's public emergency-room search surface.

## What it can and cannot report

- It resolves a user-provided location to coordinates, then calls E-Gen's public nearby emergency-room list endpoint.
- It reports distance, hospital category, address, phone, update time, and operation flags such as emergency-room operation and inpatient-bed operation.
- Operation flags are tri-state: `true` for upstream `Y`, `false` for upstream `N`, and `null` when E-Gen omits or changes a flag value.
- It does **not** claim exact real-time remaining bed counts. The public E-Gen nearby list exposes operation flags, not per-hospital remaining bed numbers.
- For emergencies, call 119 or the hospital directly. Public E-Gen/Kakao data can lag, fail, or be incomplete and is not medical advice.

## Public surfaces

- NEMC monitoring entry point: `https://dw.nemc.or.kr/nemcMonitoring/mainmgr/Main.do`
- E-Gen emergency-room search page: `https://www.e-gen.or.kr/egen/search_emergency_room.do`
- E-Gen nearby emergency-room list endpoint: `https://www.e-gen.or.kr/egen/retrieve_emergency_room_list.do`
- Kakao Map mobile search: `https://m.map.kakao.com/actions/searchView?q=<query>`
- Kakao Map place panel JSON: `https://place-api.map.kakao.com/places/panel3/<confirmId>`

## Usage

```js
const { searchNearbyEmergencyRoomsByLocationQuery } = require("emergency-room-beds");

async function main() {
  const result = await searchNearbyEmergencyRoomsByLocationQuery("광화문", {
    limit: 3,
    radius: 5
  });

  console.log(result.anchor);
  console.log(result.items);
  console.log(result.meta.bedCountLimitation);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Public API

- `parseCoordinateQuery(locationQuery)`
- `buildEmergencyRoomListRequest(options)`
- `normalizeEmergencyRoomRows(payload, origin, options)`
- `searchNearbyEmergencyRoomsByCoordinates(options)`
- `searchNearbyEmergencyRoomsByLocationQuery(locationQuery, options)`

## Result fields

Each item includes:

- `name`, `emergencyGrade`, `hospitalType`
- `address`, `phone`, `latitude`, `longitude`, `distanceKm`
- `bedStatus.emergencyRoomOperating`
- `bedStatus.inpatientBedsOperating`
- `bedStatus.traumaCenter`
- `bedStatus.pediatricSpecialty`
- `bedStatus.currentGeneralCareAvailable`
- `updatedAt`, `sourceUrl`, `mapUrl`
