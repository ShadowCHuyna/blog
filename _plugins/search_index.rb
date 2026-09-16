require "json"

module Jekyll
  class SearchIndex < Generator
    safe true
    priority :low

    def generate(site)
      docs = (site.posts.docs + site.collections["articles"].docs)
             .sort_by { |d| d.data["date"].to_s }
             .reverse
      entries = docs.map do |d|
        {
          "title" => d.data["title"].to_s,
          "url" => d.url,
          "date" => (d.data["date"] || "").to_s,
          "author" => Array(d.data["authors"]).join(", "),
          "tags" => Array(d.data["tags"]).map(&:to_s),
          "content" => clean(d.content)
        }
      end

      site.pages << SearchPage.new(site, JSON.generate("entries" => entries))
    end

    def clean(content)
      content
        .gsub(%r{\{\%.*?\%\}}, " ")
        .gsub(%r{\{\{.*?\}\}}, " ")
        .gsub(%r{!\[[^\]]*\]\([^)]*\)}, " ")
        .gsub(%r{\[([^\]]*)\]\([^)]*\)}, '\1')
        .gsub(%r{[#*_`>|]}, " ")
        .gsub(%r{\s+}, " ")
        .strip
    end
  end

  class SearchPage < Page
    def initialize(site, json)
      @site = site
      @base = site.source
      @dir = ""
      @name = "search.json"

      self.process(@name)
      self.content = json
      self.data = {
        "layout" => nil,
        "render_with_liquid" => false
      }
    end
  end
end