/**
 * Thrown when an XML dump file is not formatted as expected.
 */
export class MalformedXML extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedXML";
  }
}
