"""
Test script for Excel data extraction with Docling.

This script demonstrates how to extract calculated values (not formulas)
from Excel files using openpyxl preprocessing before Docling processing.
"""
from docling.document_converter import DocumentConverter
import openpyxl
import tempfile
import os

def convert_excel_with_data_only(excel_file_path: str):
    """
    Converts an Excel file to a DoclingDocument,
    extracting only the calculated cell values (not formulas).

    Since Docling doesn't expose openpyxl's data_only parameter,
    this function pre-processes the Excel file to convert formulas to values.
    """

    # Step 1: Read Excel with data_only=True (gets calculated values)
    # Note: data_only=True requires the file to have been saved with calculated values
    print(f"Reading {excel_file_path} with openpyxl (data_only=True)...")
    workbook_data = openpyxl.load_workbook(excel_file_path, data_only=True)

    # Step 2: Save to a temporary file (this bakes in the values)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
    temp_path = temp_file.name
    temp_file.close()

    print(f"Saving values-only version to temp file: {temp_path}")
    workbook_data.save(temp_path)
    workbook_data.close()

    try:
        # Step 3: Process with Docling
        print(f"Processing with Docling...")
        converter = DocumentConverter()
        result = converter.convert(source=temp_path)

        return result
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)
            print(f"Cleaned up temp file")

print("="*80)
print("EXCEL DATA EXTRACTION TEST (Values Only, No Formulas)")
print("="*80)

result = convert_excel_with_data_only('Disprz AOP _ FY25-26.xlsx')
markdown_output = result.document.export_to_markdown()

print("\n" + "="*80)
print("EXTRACTED CONTENT:")
print("="*80)
print(markdown_output)

print("\n" + "="*80)
print(f"Total characters extracted: {len(markdown_output)}")
print("="*80)