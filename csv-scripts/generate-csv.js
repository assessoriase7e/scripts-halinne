import fs from "fs";
import path from "path";

// Function to extract numbered subfolders from a directory
function extractNumberedFolders(dirPath) {
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  const numberedFolders = [];

  items.forEach((item) => {
    if (item.isDirectory()) {
      const fullPath = path.join(dirPath, item.name);
      // Check if the folder name is a number
      if (/^\d+$/.test(item.name)) {
        numberedFolders.push(parseInt(item.name, 10));
      }
    }
  });

  return numberedFolders.sort((a, b) => a - b);
}

// Function to extract all numbered folders from subcategories within a category
function extractCodesFromCategory(categoryPath) {
  const allCodes = new Set();
  
  // Get all subcategory folders
  const subcategories = fs
    .readdirSync(categoryPath, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  // Extract numbered folders from each subcategory
  subcategories.forEach((subcategory) => {
    const subcategoryPath = path.join(categoryPath, subcategory);
    const codes = extractNumberedFolders(subcategoryPath);
    codes.forEach((code) => allCodes.add(code));
  });

  return Array.from(allCodes).sort((a, b) => a - b);
}

// Function to generate CSV content with new columns
function generateCSV(codes) {
  let csvContent = "código,peso,tamanho,altura,largura,comprimento\n";

  codes.forEach((code) => {
    csvContent += `${code},,,,,\n`;
  });

  return csvContent;
}

// Main execution
function main() {
  const organizedDir = "./rename-images/organized";
  const outputDir = "./csv-output";

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all category folders
  const categories = fs
    .readdirSync(organizedDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  // Generate a CSV file for each category
  categories.forEach((category) => {
    const categoryPath = path.join(organizedDir, category);
    const codes = extractCodesFromCategory(categoryPath);
    
    // Generate CSV content
    const csvContent = generateCSV(codes);
    
    // Create output file path
    const outputFile = path.join(outputDir, `${category}_codes.csv`);
    
    // Write to file
    fs.writeFileSync(outputFile, csvContent);
    
    console.log(`CSV file generated for ${category}: ${outputFile}`);
    console.log(`Total codes for ${category}: ${codes.length}`);
    if (codes.length > 0) {
      console.log(
        `Codes range from ${codes[0]} to ${codes[codes.length - 1]}`
      );
    }
    console.log("---");
  });

  console.log(`All CSV files have been generated in the ${outputDir} directory.`);
}

main();
