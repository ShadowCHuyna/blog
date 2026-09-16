module Jekyll
  class TagPages < Generator
    safe true
    priority :low

    def generate(site)
      docs = site.posts.docs + site.collections["articles"].docs + site.collections["projects"].docs
      by_tag = Hash.new { |h, k| h[k] = [] }
      docs.each do |doc|
        Array(doc.data["tags"]).each do |tag|
          by_tag[tag.to_s.strip] << doc unless tag.to_s.strip.empty?
        end
      end
      return if by_tag.empty?

      by_tag = by_tag.sort.each_with_object({}) do |(tag, items), h|
        h[tag] = items.sort_by { |d| d.data["date"].to_s }.reverse
      end

      site.pages << TagIndexPage.new(site, by_tag)
      by_tag.each do |tag, items|
        site.pages << TagPage.new(site, tag, items)
      end
    end
  end

  class TagIndexPage < Page
    def initialize(site, by_tag)
      @site = site
      @base = site.source
      @dir = "tags"
      @name = "index.html"

      self.process(@name)
      self.data = {
        "layout" => "tags",
        "title" => "Теги",
        "by_tag" => by_tag
      }
    end
  end

  class TagPage < Page
    def initialize(site, tag, items)
      @site = site
      @base = site.source
      @dir = "tag"
      @name = "#{slug(tag)}/index.html"

      self.process(@name)
      self.data = {
        "layout" => "tag",
        "title" => tag,
        "tag" => tag,
        "tagged" => items
      }
    end

    def slug(tag)
      tag.downcase.gsub(%r{\s+}, "-")
    end
  end
end