let libraryDataPromise = null;

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export async function loadLibraryData() {
  if (libraryDataPromise) return libraryDataPromise;

  libraryDataPromise = (async () => {
    const response = await fetch('/data/library_data.csv');
    const csvText = await response.text();
    const rows = csvText.trim().split('\n');
    const headers = rows[0].split(',');

    return rows.slice(1).map((row) => {
      const values = row.split(',');
      const rowObject = {};

      headers.forEach((header, index) => {
        rowObject[header.trim()] = values[index]?.trim();
      });

      return {
        Timestamp: rowObject.Timestamp,
        Day_of_the_week: rowObject.Day_of_the_week,
        Zone_ID: rowObject.Zone_ID,
        Hour: Number((rowObject.Timestamp || '').split(' ')[1]?.split(':')[0]),
        Occupancy_Count: parseNumber(rowObject.Occupancy_Count),
        Noise_Level: parseNumber(rowObject.Noise_Level),
        Temperature: parseNumber(rowObject.Temperature),
        Air_Quality: parseNumber(rowObject.Air_Quality),
        WiFi_Speed: parseNumber(rowObject.WiFi_Speed),
        Light_Level: parseNumber(rowObject.Light_Level),
        Device_Usage_Count: parseNumber(rowObject.Device_Usage_Count),
        Total_Power_Consumption: parseNumber(rowObject.Total_Power_Consumption),
      };
    });
  })();

  return libraryDataPromise;
}
